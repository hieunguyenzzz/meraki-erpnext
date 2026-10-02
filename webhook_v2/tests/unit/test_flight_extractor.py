"""Unit tests for the flight extractor input builder and OpenAI wrapper (MWP-72).

Emails are synthetic; the OpenAI API is mocked with httpx.MockTransport.
"""

import json
from email.message import EmailMessage

import fitz
import httpx
import pytest

from webhook_v2.services.flight_extractor import ExtractionError, build_input, dh, extract, pdf_text


def _pdf_bytes(text: str) -> bytes:
    doc = fitz.open()
    doc.new_page().insert_text((72, 72), text)
    return doc.tobytes()


def _eml(attachment_filename: str = "ticket.pdf") -> bytes:
    msg = EmailMessage()
    msg["From"] = "Airline <no-reply@vietnamairlines.com>"
    msg["Subject"] = "Electronic ticket receipt"
    msg["Date"] = "Fri, 02 Oct 2026 10:00:00 +0700"
    msg.set_content("plain fallback")
    msg.add_alternative("<html><body><p>Passenger &#272;o Thi Ha</p></body></html>", subtype="html")
    msg.add_attachment(_pdf_bytes("Booking ref: ABC123"), maintype="application",
                       subtype="pdf", filename=attachment_filename)
    return msg.as_bytes()


def test_build_input_decodes_entities_and_attaches_pdf_with_text_layer():
    content, source_text = build_input(_eml())
    assert "Đo Thi Ha" in source_text
    assert "Booking ref: ABC123" in source_text
    files = [c for c in content if c["type"] == "input_file"]
    assert len(files) == 1
    assert files[0]["file_data"].startswith("data:application/pdf;base64,")


def test_pdf_with_encoded_non_pdf_filename_is_still_attached():
    raw = _eml("=?utf-8?B?dsOpLWRpZW4tdHU=?=")  # "vé-dien-tu": no .pdf suffix
    content, source_text = build_input(raw)
    assert [c["type"] for c in content] == ["input_text", "input_file"]
    assert "Booking ref: ABC123" in source_text


def _mock_client(handler) -> httpx.Client:
    return httpx.Client(transport=httpx.MockTransport(handler))


def test_extract_returns_parsed_dict():
    extraction = {"email_type": "ticket", "booking_code": "ABC123"}

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        assert body["text"]["format"]["strict"] is True
        return httpx.Response(200, json={
            "status": "completed",
            "output": [{"type": "reasoning"},
                       {"type": "message", "content": [{"type": "output_text", "text": json.dumps(extraction)}]}],
            "usage": {"input_tokens": 10, "output_tokens": 5},
        })

    result, source_text = extract(_eml(), http=_mock_client(handler))
    assert result == extraction
    assert "Booking ref: ABC123" in source_text


def test_http_500_raises_extraction_error():
    client = _mock_client(lambda request: httpx.Response(500, text="boom"))
    with pytest.raises(ExtractionError):
        extract(_eml(), http=client)


def test_missing_output_raises_extraction_error():
    client = _mock_client(lambda request: httpx.Response(200, json={"output": []}))
    with pytest.raises(ExtractionError):
        extract(_eml(), http=client)


def test_invalid_json_raises_extraction_error():
    body = {"output": [{"type": "message", "content": [{"type": "output_text", "text": "not json"}]}]}
    client = _mock_client(lambda request: httpx.Response(200, json=body))
    with pytest.raises(ExtractionError):
        extract(_eml(), http=client)


def test_incomplete_status_raises_extraction_error():
    body = {"status": "incomplete", "incomplete_details": {"reason": "max_output_tokens"},
            "output": [{"type": "message", "content": [{"type": "output_text", "text": "{}"}]}]}
    client = _mock_client(lambda request: httpx.Response(200, json=body))
    with pytest.raises(ExtractionError, match="max_output_tokens"):
        extract(_eml(), http=client)


def test_non_dict_json_raises_extraction_error():
    body = {"status": "completed", "output": [{"type": "message", "content": [{"type": "output_text", "text": "[1]"}]}]}
    client = _mock_client(lambda request: httpx.Response(200, json=body))
    with pytest.raises(ExtractionError):
        extract(_eml(), http=client)


def test_http_error_includes_response_body():
    client = _mock_client(lambda request: httpx.Response(400, text="bad schema detail"))
    with pytest.raises(ExtractionError, match="bad schema detail"):
        extract(_eml(), http=client)


def test_dh_returns_input_for_unknown_charset():
    assert dh("=?x-no-such-charset?q?abc?=") == "=?x-no-such-charset?q?abc?="


def test_dh_decodes_normal_header():
    assert dh("=?utf-8?q?Vietnam_Airlines?=") == "Vietnam Airlines"


def test_pdf_text_of_corrupt_data_does_not_raise():
    assert pdf_text(b"not a pdf") == ""


def test_body_part_with_unknown_charset_is_skipped():
    msg = EmailMessage()
    msg["Subject"] = "x"
    msg.set_content("hello")
    raw = msg.as_bytes().replace(b'charset="utf-8"', b'charset="x-no-such-charset"')
    _, source_text = build_input(raw)
    assert "Subject: x" in source_text and "hello" not in source_text
