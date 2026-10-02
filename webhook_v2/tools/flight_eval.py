"""
Model regression tool for flight extraction (MWP-72).

Runs the PRODUCTION prompt, schema and code path (webhook_v2.services.flight_extractor.extract) over a
folder of saved .eml files and scores every result against ground truth parsed with regexes from the
PDF text layer, plus subject rules, plus the production grounding check. Exits non-zero on any mistake.

The emails contain staff data: keep the folder OUTSIDE the repository. See README_flight_eval.md.
"""
import argparse
import concurrent.futures as cf
import email
import glob
import json
import os
import re
import sys
import time
from collections import Counter
from datetime import date
from email.utils import parseaddr

from webhook_v2.config import settings
from webhook_v2.processors.flight_checks import grounding_errors
from webhook_v2.services.flight_extractor import ExtractionError, build_input, dh, extract, pdf_text
from webhook_v2.services.flight_mailbox import FORWARDER, MONTHS, FlightMailbox, is_candidate

MON = {m: i + 1 for i, m in enumerate("jan feb mar apr may jun jul aug sep oct nov dec".split())}
AIRPORT = [("CAM RANH", "CXR"), ("TAN SON NHAT", "SGN"), ("HO CHI MINH", "SGN"), ("PHU QUOC", "PQC"), ("TUY HOA", "TBB"),
           ("DONG TAC", "TBB"), ("NOI BAI", "HAN"), ("DA NANG", "DAD"), ("HUE", "HUI"), ("LIEN KHUONG", "DLI"), ("PHU CAT", "UIH")]
DOC_FIELDS = ["doc_type", "passenger_name", "document_number", "related_ticket_number", "issue_date", "fare_amount",
              "total_amount", "has_previously_paid_items"]
SEG_FIELDS = ["origin", "destination", "departure", "arrival", "fare_family", "booking_class"]
FLIGHT_LINE = r"\b((?:VN|VJ|9G|QH|BL|0V)\d{3,4})\s+(\d{2}:\d{2})\s+(\d{2}:\d{2})"
FLIGHT_START = r"\b(?:VN|VJ|9G|QH|BL|0V)\d{3,4}\s+\d{2}:\d{2}"
DECOY_SENDER_RE = re.compile(r"invoice|hoadon|bizzi", re.I)


# ---------------------------------------------------------------- ground truth (pure)

def ap(txt):
    for k, v in AIRPORT:
        if k in txt.upper():
            return v
    return None


def d(s):  # 18Aug2026 -> 2026-08-18
    m = re.match(r"(\d{2})([A-Za-z]{3})(\d{4})", s)
    return f"{m.group(3)}-{MON[m.group(2).lower()]:02d}-{m.group(1)}"


def parse_doc(t):
    """Ground-truth fields of one ticket/EMD receipt from its PDF text layer; None if it is not a receipt."""
    if not re.search(r"Ticket number|Số vé|Document Number|Số chứng từ", t) or "BOARDING" in t.upper()[:400]:
        return None
    emd = bool(re.search(r"Document Number|Số chứng từ", t))
    g = lambda pat: (re.search(pat, t) or [None, None])[1]
    number = lambda label: (lambda m: m.group(1) + m.group(2) if m else None)(
        re.search(label + r"\s*:\s*(\d{3})\s?(\d{10})", t))
    amount = lambda pat: (lambda v: int(v) if v else None)(g(pat))
    m = re.search(r"(?:Passenger|Hành khách)\s*:\s*(.+?)\s+(?:Mr|Ms|Mrs|Miss|Mstr)\b", t)
    doc = {
        "doc_type": "emd" if emd else "ticket",
        "passenger_name": m.group(1).strip() if m else None,
        "document_number": number(r"(?:Ticket number|Số vé|Document Number|Số chứng từ)"),
        "related_ticket_number": number(r"In connection with"),
        "issue_date": (lambda v: d(v) if v else None)(g(r"(?:Date|Ngày)\s*:\s*(\d{2}[A-Za-z]{3}\d{4})")),
        "fare_amount": amount(r"(?:Fare|Giá vé)\s*:\s*VND\s*(\d+)"),
        "total_amount": amount(r"(?:Total amount|Tổng tiền|Tổng thanh toán)\s*:\s*VND\s*(\d+)"),
        "has_previously_paid_items": bool(re.search(r"VND PD |\bPD \d", t)),
    }
    segs, lines = [], t.splitlines()
    for i, ln in enumerate(lines):
        m = re.search(FLIGHT_LINE, ln)
        if not m:
            continue
        parts = re.split(r"\s{2,}", ln[:m.start()].strip())
        nxt = lines[i + 1] if i + 1 < len(lines) else ""
        dates = re.findall(r"\d{2}[A-Za-z]{3}\d{4}", nxt)
        cls = None
        for j in range(i + 1, min(i + 10, len(lines))):
            if re.search(FLIGHT_START, lines[j]):
                break
            c = re.search(r"(?:Class|Hạng)\s*:\s*([^,\n]*?)\s*,\s*([A-Z])\b", lines[j])
            if c:
                cls = (c.group(1).strip() or None, c.group(2))
                break
        segs.append({"flight_no": m.group(1), "origin": ap(parts[0]) if parts else None,
                     "destination": ap(parts[1]) if len(parts) > 1 else ap(nxt),
                     "departure": f"{d(dates[0])}T{m.group(2)}" if dates else None,
                     "arrival": f"{d(dates[-1])}T{m.group(3)}" if dates else None,
                     "fare_family": cls[0] if cls else None, "booking_class": cls[1] if cls else None})
    if doc["document_number"] is None:  # e.g. an airline VAT invoice PDF that merely mentions "Số vé"
        return None
    doc["_segments"] = segs
    doc["_pnr"] = g(r"(?:Booking ref|Mã đặt chỗ)\s*:\s*([A-Z0-9]{6})")
    return doc


def truth_docs(subject: str, pdf_texts: list[str]) -> list[dict]:
    if "Boarding" in subject:
        return []
    return [x for x in (parse_doc(t) for t in pdf_texts) if x]


def expected_types(subject: str, sender: str, truth: list[dict]) -> set[str]:
    f = sender.lower()
    if "Boarding Pass" in subject: return {"boarding_pass"}
    if "SCHEDULE CHANGE" in subject: return {"schedule_change"}
    if "hoàn vé" in subject: return {"refund"}
    if "Đặt chỗ vào" in subject or "Thông tin hành trình" in subject: return {"ticket"}
    if "Travel Reservation" in subject:
        only_emd = any(x["doc_type"] == "emd" for x in truth) and not any(x["doc_type"] == "ticket" for x in truth)
        return {"emd"} if only_emd else {"ticket"}
    if "Your Order" in subject or "Booking Confirmation" in subject: return {"booking_summary"}
    if ("vietnamairlines" in f and "einvoice" in f) or "vietjet" in f: return {"airline_invoice"}
    return {"not_flight"}


def norm_name(s):
    return re.sub(r"\s+", " ", (s or "")).strip().lower()


def score_email(subject: str, sender: str, source: str, r: dict, truth: list[dict]) -> tuple[Counter, list[str]]:
    """Score one extraction. Returns (counters, mistakes)."""
    c, errs = Counter(), []
    c["emails"] += 1
    exp = expected_types(subject, sender, truth)
    c["type_ok"] += r["email_type"] in exp
    if r["email_type"] not in exp:
        errs.append(f"type {r['email_type']} expected {exp} | {subject[:55]}")
    for e in grounding_errors(r, source):
        errs.append(f"UNGROUNDED {e}")
        c["ungrounded"] += 1
    m = re.search(r"\b([A-Z0-9]{6})\b(?= cho |, \d{1,2}[A-Z]{3}\d{4}| for |\)| - )", subject)
    if m and re.search(r"[A-Z]", m.group(1)) and re.search(r"\d", m.group(1)) and r["booking_code"] != m.group(1):
        errs.append(f"booking_code {r['booking_code']!r} but subject has {m.group(1)}")
        c["pnr_subject_miss"] += 1
    got = {x["document_number"]: x for x in r["documents"]}
    gsegs = {s["flight_no"]: s for s in r["segments"]}
    for t in truth:
        c["docs"] += 1
        if r["booking_code"] != t["_pnr"]:
            errs.append(f"booking_code {r['booking_code']} != {t['_pnr']}")
        g = got.get(t["document_number"])
        if not g:
            errs.append(f"document {t['document_number']} missing; got {list(got)}")
            continue
        ok = True
        for f in DOC_FIELDS:
            tv, gv = t[f], g[f]
            if f == "passenger_name": tv, gv = norm_name(tv), norm_name(gv)
            if f in ("fare_amount", "total_amount") and gv is not None: gv = int(gv)
            if tv != gv:
                errs.append(f"doc {t['document_number']} {f}: got {gv!r} truth {tv!r}")
                ok = False
        if t["doc_type"] == "ticket":
            if set(gsegs) != {s["flight_no"] for s in t["_segments"]}:
                errs.append(f"flights {set(gsegs)} != {[s['flight_no'] for s in t['_segments']]}")
                ok = False
            for ts in t["_segments"]:
                gs = gsegs.get(ts["flight_no"])
                if not gs: continue
                for f in SEG_FIELDS:
                    tv, gv = ts[f], gs[f]
                    if f == "fare_family": tv, gv = (tv or "").lower() or None, (gv or "").lower() or None
                    if tv != gv:
                        errs.append(f"{ts['flight_no']} {f}: got {gv!r} truth {tv!r}")
                        ok = False
        c["docs_all_fields_ok"] += ok
    return c, errs


def differences(a: dict, b: dict) -> list[str]:
    """Keys whose extraction differs between two runs, ignoring note and pure boarding_pass emails."""
    strip = lambda r: {k: v for k, v in r.items() if not k.startswith("_") and k != "note"}
    return [k for k in sorted(a) if k in b and not (a[k].get("email_type") == b[k].get("email_type") == "boarding_pass")
            and strip(a[k]) != strip(b[k])]


# ---------------------------------------------------------------- folder I/O

def load_index(emails_dir: str) -> dict:
    with open(f"{emails_dir}/index.json") as f:
        return {f"{x['id']:04d}": x for x in json.load(f)}


def load_run(run_dir: str) -> dict:
    return {os.path.basename(p)[:4]: json.load(open(p)) for p in glob.glob(f"{run_dir}/*.json")}


def pdf_layers(raw: bytes) -> list[str]:
    parts = []
    for p in email.message_from_bytes(raw).walk():
        fn = dh(p.get_filename()) if p.get_filename() else None
        if p.get_content_type() == "application/pdf" or (fn and fn.lower().endswith(".pdf")):
            parts.append(pdf_text(p.get_payload(decode=True)))
    return parts


def score_run(emails_dir: str, index: dict, results: dict) -> tuple[Counter, list[tuple[str, str]]]:
    total, errs = Counter(), []
    for key in sorted(index):
        r = results.get(key)
        if r is None or "error" in r:
            errs.append((key, "API error / missing"))
            continue
        raw = open(f"{emails_dir}/eml/{key}.eml", "rb").read()
        subject, sender = index[key]["subject"], index[key]["from"]
        c, e = score_email(subject, sender, build_input(raw)[1], r, truth_docs(subject, pdf_layers(raw)))
        total += c
        errs += [(key, x) for x in e]
    return total, errs


# ---------------------------------------------------------------- running the model

def run_one(emails_dir: str, out_dir: str, key: str) -> str:
    dest = f"{out_dir}/{key}.eml.json"
    if os.path.exists(dest):
        return "cached"
    raw = open(f"{emails_dir}/eml/{key}.eml", "rb").read()
    t0 = time.time()
    for attempt in range(3):
        try:
            result, _ = extract(raw)
            break
        except ExtractionError as exc:
            if attempt == 2:
                return f"ERROR {exc}"[:300]  # not cached, so the next invocation retries; scored as missing
            time.sleep(5)
    result["_secs"] = round(time.time() - t0, 1)
    with open(dest, "w") as f:
        json.dump(result, f, ensure_ascii=False, indent=1)
    return f"{result['email_type']} {result['booking_code']} {result['_secs']}s"


def run_model(emails_dir: str, out_dir: str, index: dict, workers: int) -> None:
    os.makedirs(out_dir, exist_ok=True)
    keys = sorted(index)
    with cf.ThreadPoolExecutor(workers) as ex:
        for key, status in zip(keys, ex.map(lambda k: run_one(emails_dir, out_dir, k), keys)):
            print(key, status, flush=True)


# ---------------------------------------------------------------- download

def is_eval_candidate(sender: str, subject: str) -> bool:
    """Broader than production's is_candidate so not_flight decoys (airport shop invoices etc.) are included."""
    address = parseaddr(sender)[1].lower()
    return is_candidate(sender, subject) or address == FORWARDER or bool(DECOY_SENDER_RE.search(address))


def download(dest: str, since: date) -> None:
    os.makedirs(f"{dest}/eml", exist_ok=True)
    mailbox, index = FlightMailbox(), []
    with mailbox._open() as conn:
        status, data = conn.uid("SEARCH", None, "SINCE", f"{since.day:02d}-{MONTHS[since.month - 1]}-{since.year}")
        uids = data[0].split() if status == "OK" and data and data[0] else []
        print(f"{len(uids)} messages since {since}")
        for uid in uids:
            status, h = conn.uid("FETCH", uid, "(BODY.PEEK[HEADER.FIELDS (FROM SUBJECT)])")
            if status != "OK" or not h or not isinstance(h[0], tuple):
                print(f"header fetch failed uid={uid.decode()}", file=sys.stderr)
                continue
            headers = email.message_from_bytes(h[0][1])
            if not is_eval_candidate(str(headers["From"] or ""), dh(headers["Subject"])):
                continue
            raw = mailbox._fetch_candidate(conn, uid, require_candidate=False)
            if raw is None:
                print(f"body fetch failed uid={uid.decode()}", file=sys.stderr)
                continue
            n = len(index) + 1
            with open(f"{dest}/eml/{n:04d}.eml", "wb") as f:
                f.write(raw.raw)
            index.append({"id": n, "from": raw.sender, "subject": raw.subject, "date": raw.date.isoformat() if raw.date else None})
    with open(f"{dest}/index.json", "w") as f:
        json.dump(index, f, ensure_ascii=False, indent=1)
    print(f"saved {len(index)} emails to {dest}")


# ---------------------------------------------------------------- CLI

def main(argv=None) -> int:
    ap_ = argparse.ArgumentParser(description=__doc__.strip().splitlines()[0])
    ap_.add_argument("--download", metavar="DIR", help="save candidate emails from the invoice mailbox to DIR")
    ap_.add_argument("--since", help="YYYY-MM-DD, with --download")
    ap_.add_argument("--emails", metavar="DIR", help="folder with eml/ and index.json to evaluate")
    ap_.add_argument("--runs", type=int, default=2)
    ap_.add_argument("--model", default=settings.openai_model)
    ap_.add_argument("--effort", default=settings.openai_reasoning_effort)
    ap_.add_argument("--workers", type=int, default=6)
    args = ap_.parse_args(argv)

    if args.download:
        if not args.since:
            ap_.error("--download needs --since YYYY-MM-DD")
        download(args.download, date.fromisoformat(args.since))
        return 0
    if not args.emails:
        ap_.error("give --emails DIR or --download DIR")

    settings.openai_model, settings.openai_reasoning_effort = args.model, args.effort
    tag = f"{args.model}-{args.effort}"
    index = load_index(args.emails)
    failed, results = False, {}
    for n in range(1, args.runs + 1):
        run = f"run{n}"
        out_dir = f"{args.emails}/out/{tag}/{run}"
        print(f"\n--- {tag} {run}: {len(index)} emails -> {out_dir}")
        run_model(args.emails, out_dir, index, args.workers)
        results[run] = load_run(out_dir)
        c, errs = score_run(args.emails, index, results[run])
        print(f"\n===== {tag} {run}")
        print(f"  emails            {c['emails']}/{len(index)}")
        print(f"  types correct     {c['type_ok']}/{c['emails']}")
        print(f"  documents correct {c['docs_all_fields_ok']}/{c['docs']}")
        print(f"  ungrounded values {c['ungrounded']}")
        print(f"  booking_code vs subject misses {c['pnr_subject_miss']}")
        print(f"  mistakes          {len(errs)}")
        for key, e in errs:
            print("   ", key, e)
        failed |= bool(errs)
    for run in list(results)[1:]:
        diff = differences(results["run1"], results[run])
        print(f"\nrun1 vs {run}: {len(diff)} emails differ (excluding note and boarding_pass) {diff}")
    print("\nFAILED" if failed else "\nPASSED")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
