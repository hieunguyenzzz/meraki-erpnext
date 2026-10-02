# Flight extraction regression tool (MWP-72)

Re-scores the production flight extraction against real emails. Run it after ANY change to
`PROMPT`, `SCHEMA` or `build_input` in `webhook_v2/services/flight_extractor.py`, and before switching model.

It imports the production prompt, schema and `extract()` and uses the production
`flight_checks.grounding_errors`, so it always tests what the sync really does.

## The emails must stay outside the repository

The emails contain staff data (names, ticket numbers, travel plans). **Never put the folder inside the repo and
never commit any `.eml`, `index.json` or `out/` file.** Keep it somewhere like `~/flight-eval/` or `/tmp/...`.

## 1. Build the folder (needs `HOADON_IMAP_*` settings)

    python -m webhook_v2.tools.flight_eval --download ~/flight-eval --since 2026-01-01

Creates `~/flight-eval/eml/NNNN.eml` and `~/flight-eval/index.json`. It uses a broader filter than production
(airline senders, the forwarder, and any sender with "invoice"/"hoadon"/"bizzi") so `not_flight` decoys are included.

## 2. Run it (needs `OPENAI_API_KEY`; this makes one OpenAI call per email per run)

    python -m webhook_v2.tools.flight_eval --emails ~/flight-eval --runs 2 [--model M] [--effort E] [--workers 6]

Model and effort default to `OPENAI_MODEL` / `OPENAI_REASONING_EFFORT`. Results are cached in
`~/flight-eval/out/<model>-<effort>/<run>/`; delete a run folder to re-run it.

Inside the container (the folder mounted from outside the repo):

    docker compose -f docker-compose.yml -f docker-compose.local.yml run --rm --no-deps \
      -v ~/flight-eval:/eval email-processor-v2 python -m webhook_v2.tools.flight_eval --emails /eval --runs 2

## What it checks

- email type against subject/sender rules
- every ticket/EMD document and flight segment against values parsed with regexes from the PDF text layer
- booking code against the one in the subject
- grounding: every code, number and amount returned must appear in the source text
- run-to-run differences (ignoring `note` and pure `boarding_pass` emails); informational only

Exit code is non-zero on ANY mistake or ungrounded value, or a missing/failed API result. Baseline on 77 emails:
77/77 types, 36/36 documents, 0 ungrounded.
