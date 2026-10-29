"""HEIC -> JPEG conversion for expense receipts (MWP-88)."""

import io

from PIL import Image
from pillow_heif import register_heif_opener

from webhook_v2.services.receipt_image import to_browser_image

register_heif_opener()


def _bytes(fmt: str) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (8, 8), (200, 30, 30)).save(buf, format=fmt)
    return buf.getvalue()


def test_heic_converted_to_jpeg():
    data, name = to_browser_image(_bytes("HEIF"), "IMG_0001.HEIC")
    assert name == "IMG_0001.jpg"
    assert data[:3] == b"\xff\xd8\xff"
    assert Image.open(io.BytesIO(data)).size == (8, 8)


def test_heic_detected_by_content_not_extension():
    data, name = to_browser_image(_bytes("HEIF"), "receipt.jpg")
    assert name == "receipt.jpg"
    assert data[:3] == b"\xff\xd8\xff"


def test_jpeg_passes_through():
    jpeg = _bytes("JPEG")
    assert to_browser_image(jpeg, "a.jpg") == (jpeg, "a.jpg")


def test_pdf_passes_through():
    pdf = b"%PDF-1.4\n%fake\n"
    assert to_browser_image(pdf, "a.pdf") == (pdf, "a.pdf")


def test_garbage_heic_passes_through():
    junk = b"not an image at all"
    assert to_browser_image(junk, "a.heic") == (junk, "a.heic")


def test_corrupt_heif_passes_through():
    bad = b"\x00\x00\x00\x18ftypheic" + b"\x00" * 20
    assert to_browser_image(bad, "a.heic") == (bad, "a.heic")


def test_input_shorter_than_ftyp_header_passes_through():
    short = b"\x00\x00\x00\x0cftyp"
    assert to_browser_image(short, "a.heic") == (short, "a.heic")
    assert to_browser_image(b"", "a.heic") == (b"", "a.heic")
