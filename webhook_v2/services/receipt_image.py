"""Convert iPhone HEIC receipts to JPEG so browsers can render them (MWP-88)."""

import io
from pathlib import PurePath

from webhook_v2.core.logging import get_logger

log = get_logger(__name__)

_HEIF_BRANDS = {b"heic", b"heix", b"hevc", b"heim", b"heis", b"mif1", b"msf1"}


def is_heif(data: bytes) -> bool:
    """True if data starts with an ISO-BMFF ftyp box carrying a HEIC/HEIF brand."""
    return data[4:8] == b"ftyp" and data[8:12] in _HEIF_BRANDS


def to_browser_image(data: bytes, filename: str) -> tuple[bytes, str]:
    """Return (bytes, filename) as JPEG if data is HEIC/HEIF, else unchanged.

    Never raises: if decoding fails the original is returned so the upload proceeds.
    """
    if not is_heif(data):
        return data, filename
    try:
        from PIL import Image, ImageOps
        from pillow_heif import register_heif_opener

        register_heif_opener()
        with Image.open(io.BytesIO(data)) as img:
            icc = img.info.get("icc_profile")
            img = ImageOps.exif_transpose(img).convert("RGB")
            out = io.BytesIO()
            img.save(out, format="JPEG", quality=85, icc_profile=icc)
    except Exception as e:
        log.warning("receipt_heic_convert_failed", filename=filename, error=str(e))
        return data, filename
    return out.getvalue(), PurePath(filename).stem + ".jpg"
