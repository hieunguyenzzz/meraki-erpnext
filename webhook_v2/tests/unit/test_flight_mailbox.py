"""Unit tests for the flight mailbox pre-filter (MWP-72)."""

from datetime import date

import pytest

from webhook_v2.services.flight_mailbox import is_candidate

HOADON = "hoadon.merakiwp@gmail.com"


@pytest.mark.parametrize(
    "sender,subject",
    [
        ("Vietnam Airlines <no-reply@vietnamairlines.com>", "Electronic ticket receipt"),
        ("VietjetAir <einvoice@vietjetair.com>", "Hoa don dien tu Vietjet"),
        ("Sun PhuQuoc Airways <noreply@sunphuquocairways.com>", "Đặt chỗ vào 30MAR - ABC123 cho NGUYEN"),
        ("Bamboo <info@bambooairways.com>", "Your booking"),
        ("Vietravel <x@vietravelairlines.com>", "Itinerary"),
        ("Pacific <x@pacificairlines.com.vn>", "Thông báo"),
        (HOADON, "Fwd: Yêu cầu hoàn vé máy bay VN6151"),
        (f"Meraki <{HOADON}>", "FW: BOARDING PASS"),
    ],
)
def test_airline_and_forwarded_refund_mail_are_candidates(sender, subject):
    assert is_candidate(sender, subject)


@pytest.mark.parametrize(
    "sender,subject",
    [
        ("Autogrill <noreply@einvoice.com.vn>", "Hóa đơn điện tử - nhà hàng sân bay"),
        ("Pho 24 <billing@pho24.vn>", "Hóa đơn bữa ăn"),
        ("Google <no-reply@accounts.google.com>", "Security alert"),
        ("Someone <someone@example.com>", "Hoàn vé máy bay"),
    ],
)
def test_other_mail_is_not_a_candidate(sender, subject):
    assert not is_candidate(sender, subject)


def test_encoded_display_name_with_comma_does_not_hide_airline_domain():
    sender = "=?utf-8?q?Vietnam_Airlines=2C_Customer_Care?= <noreply.einvoice@vietnamairlines.com>"
    assert is_candidate(sender, "Anything")


def test_decomposed_unicode_subject_matches():
    import unicodedata
    subject = unicodedata.normalize("NFD", "Fwd: Yêu cầu hoàn vé")
    assert is_candidate(HOADON, subject)


def test_forwarded_english_refund_subject_is_candidate():
    assert is_candidate(HOADON, "Fwd: Refund request VN6151")
    assert is_candidate(HOADON, "Fwd: Hủy vé VN6151")


class _FakeIMAP:
    """Gmail-like IMAP: an airline email at UID 42, a non-airline one at UID 44, UIDVALIDITY 7."""
    MESSAGES = {
        b"42": b"From: VNA <no-reply@vietnamairlines.com>\r\nSubject: Ticket\r\nMessage-ID: <a@vna>\r\n\r\n",
        b"44": b"From: Bank <x@bank.example>\r\nSubject: Statement\r\nMessage-ID: <b@bank>\r\n\r\n",
    }

    def __init__(self, *args, **kwargs):
        self.selected, self.fetched = None, []

    def login(self, user, password):
        return "OK", [b""]

    def list(self):
        return "OK", [b'(\\HasNoChildren \\All) "/" "[Gmail]/All Mail"']

    def select(self, folder, readonly=False):
        self.selected = (folder, readonly)
        return "OK", [b"1"]

    def response(self, code):
        return code, [b"7"]

    def uid(self, command, uid, query):
        self.fetched.append((uid, query))
        headers = self.MESSAGES.get(uid)
        if headers is None:
            return "OK", [None]
        return "OK", [(uid + b" (BODY[] {n}", headers + b"body" if query == "(BODY.PEEK[])" else headers), b")"]

    def logout(self):
        return "BYE", [b""]


def _mailbox(monkeypatch):
    from webhook_v2.services import flight_mailbox

    conns = []
    monkeypatch.setattr(flight_mailbox.imaplib, "IMAP4_SSL", lambda *a, **k: conns.append(_FakeIMAP()) or conns[-1])
    return flight_mailbox.FlightMailbox("h", 993, "u", "p"), conns


def test_fetch_by_uid_refetches_read_only_candidates_with_folder_and_uidvalidity(monkeypatch):
    mailbox, conns = _mailbox(monkeypatch)
    emails = list(mailbox.fetch_by_uid([42, 43, 44], folder="[Gmail]/All Mail", uidvalidity=7))
    assert [(e.uid, e.message_id, e.folder, e.uidvalidity) for e in emails] == [(42, "<a@vna>", "[Gmail]/All Mail", 7)]
    assert conns[0].selected == ('"[Gmail]/All Mail"', True)


def test_fetch_by_uid_refuses_when_uidvalidity_changed(monkeypatch):
    from webhook_v2.services.flight_mailbox import UidValidityChanged

    mailbox, conns = _mailbox(monkeypatch)
    with pytest.raises(UidValidityChanged):
        list(mailbox.fetch_by_uid([42], folder="[Gmail]/All Mail", uidvalidity=6))
    assert conns[0].fetched == []  # nothing fetched under the wrong numbering


def test_fetch_since_skips_body_of_handled_email(monkeypatch):
    mailbox, conns = _mailbox(monkeypatch)
    conn_uid = _FakeIMAP.uid

    def uid(self, command, *args):
        if command == "SEARCH":
            return "OK", [b"42 44"]
        return conn_uid(self, command, *args)

    monkeypatch.setattr(_FakeIMAP, "uid", uid)
    assert list(mailbox.fetch_since(date(2026, 1, 1), skip=lambda mid: mid == "<a@vna>")) == []
    assert (b"42", "(BODY.PEEK[])") not in conns[0].fetched
