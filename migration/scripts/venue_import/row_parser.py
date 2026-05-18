"""
Parses a raw 2-D grid (from sheets_reader) into a list of venue dicts.

Sheet layout:
  Row 1 + 2 = merged group headers (skipped).
  Row 3 onward = data.

  A row is a PARENT (new venue) when the venue_name cell is non-empty.
  A row with an empty venue_name cell is a CHILD (extra area for the previous venue).

  HCM tab has no "Location" column — column A starts at "Type of venue".
  All other tabs have "Location" at column A.

Carry-forward rules:
  When a child row is encountered, the parent's venue-level fields are used
  to fill the returned dict. Only the area fields differ per row.
"""

from typing import Optional


# Maps tab_name → city label used as custom_venue_city in ERPNext.
# Trailing newline on HCM is the real sheet tab name.
TAB_TO_CITY = {
    "HCM\n": "HCM",
    "Phú Quốc": "Phú Quốc",
    "Đà Nẵng": "Đà Nẵng",
    "Hội An": "Hội An",
    "Đà Lạt": "Đà Lạt",
    "Vũng Tàu & Phan Thiết": "Vũng Tàu",
    "Nha Trang - Cam Ranh": "Nha Trang",
    "Huế": "Huế",
    "Hà Nội": "Hà Nội",
    "Du Thuyền Hạ Long": "Hạ Long",
    "Ninh Bình & lân cận HN": "Ninh Bình",
    "Sapa": "Sapa",
}

# Logical field → list of header strings to match (case-insensitive substring).
# Order matters: first match wins.
# NOTE: headers are matched against combined text from rows 0 and 1 of the sheet,
# joined by newline. Match strings must be unique enough to avoid false positives.
HEADER_HINTS = {
    # Column A on non-HCM tabs — variously labelled "Location", "PIC", or a sales-rep tag.
    # Optional; only some tabs have it.
    "location":                  ["=location", "=pic", "khu vực địa điểm"],
    # Parent-venue fields
    "type_of_venue":             ["type of venue"],
    "venue_name":                ["venue name"],
    "price_range":               ["price range"],
    "wedding_package":           ["wedding package"],
    "insights":                  ["insight"],
    # Area fields — order matters (area_name before area_type_str to avoid overlap)
    "area_name":                 ["wedding area\narea"],
    "area_type_str":             ["wedding area\ntype", "type"],  # bare "Type" sub-column
    "area_function":             ["function"],
    "area_capacity":             ["capacity"],
    "area_policy":               ["policy/", "minimum spend", "rental fee", "policy\n"],
    "area_setup":                ["set up", "setup"],
    "area_meraki_weddings":      ["meraki's wedding", "our wedding", "meraki wedding"],
    "area_photos":               ["photo", "site inspection"],
    # Accommodation (3 sub-columns)
    "accommodation_villa":       ["accommodation\ntype of room", "accommodation\nvilla"],  # first/only sub-col sometimes
    "accommodation_residence":   ["residence"],
    "accommodation_hotel_room":  ["hotel room", "=room"],
    # F&B (3 sub-columns)
    "fnb_canapes":               ["food & beverage", "canapes", "canapés"],  # first sub-col or merged
    "fnb_menu":                  ["menu"],
    "fnb_drink":                 ["drink"],
    # AV, Facility, Address — bare "av" handles non-HCM tabs where the cell is just "AV"
    "av":                        ["av\n", "av (", "audio visual", "=av"],
    "facility":                  ["facilit"],
    "address_contact":           ["address & contact", "address and contact", "address\ncontact", "liên hệ"],
    "after_party":               ["after party", "after-party"],
}

# Fields that are REQUIRED to be present in every tab.
# Accommodation sub-fields are all optional — some tabs only have one (cruise = Villa only;
# Nha Trang = no Hotel room column). At least one accommodation column is enough.
# "location" is optional too — column A is a free-form PIC/subarea tag, not all tabs use it.
REQUIRED_FIELDS = {
    "type_of_venue", "venue_name", "price_range", "wedding_package",
    "area_name", "area_type_str", "area_function", "area_capacity",
    "area_policy", "area_setup", "area_meraki_weddings", "area_photos",
    "insights", "fnb_canapes", "fnb_menu", "fnb_drink",
    "av", "facility", "address_contact",
}

# Fields whose values carry forward from the parent row to child rows.
PARENT_CARRY_FIELDS = [
    "location", "type_of_venue", "venue_name", "price_range",
    "wedding_package", "insights", "accommodation_villa",
    "accommodation_residence", "accommodation_hotel_room",
    "fnb_canapes", "fnb_menu", "fnb_drink", "av", "facility",
    "after_party", "address_contact",
]


def _match_header(text: str, hints: list[str]) -> bool:
    """Match header text against hint patterns.

    Hint prefix `=` means exact-match the lowercased text (no substring).
    Anything else is a case-insensitive substring match.
    """
    text_lower = text.lower().strip()
    for hint in hints:
        if hint.startswith("="):
            if text_lower == hint[1:]:
                return True
        elif hint in text_lower:
            return True
    return False


def _build_column_map(header_row: list[dict], tab_name: str, is_hcm: bool) -> dict[str, int]:
    """Map logical field names to column indices based on header text."""
    col_map: dict[str, int] = {}
    for col_idx, cell in enumerate(header_row):
        text = cell["text"].strip()
        if not text:
            continue
        for field, hints in HEADER_HINTS.items():
            if field in col_map:
                continue
            if _match_header(text, hints):
                col_map[field] = col_idx
                break

    # Validate required fields. Location/PIC and accommodation sub-fields are optional.
    required = REQUIRED_FIELDS.copy()

    missing = required - set(col_map.keys())
    if missing:
        raise ValueError(
            f"Tab '{tab_name}': required columns not found in headers: {sorted(missing)}. "
            f"Found columns: {list(col_map.keys())}"
        )

    return col_map


def _cell_text(row: list[dict], col_idx: int) -> str:
    if col_idx >= len(row):
        return ""
    return row[col_idx]["text"].strip()


def _cell_url(row: list[dict], col_idx: int) -> Optional[str]:
    if col_idx >= len(row):
        return None
    return row[col_idx]["url"] or None


def _build_area(row: list[dict], col_map: dict[str, int]) -> dict:
    return {
        "area_name_text": _cell_text(row, col_map["area_name"]),
        "area_type_text": _cell_text(row, col_map["area_type_str"]),
        "area_function_text": _cell_text(row, col_map["area_function"]),
        "area_capacity_text": _cell_text(row, col_map["area_capacity"]),
        "area_policy_text": _cell_text(row, col_map["area_policy"]),
        "area_setup_text": _cell_text(row, col_map["area_setup"]),
        "area_meraki_weddings_text": _cell_text(row, col_map["area_meraki_weddings"]),
        "area_photos_url": _cell_url(row, col_map["area_photos"]),
        "area_photos_text": _cell_text(row, col_map["area_photos"]),
    }


def _join_nonempty(*parts: str) -> str:
    return "\n".join(p for p in parts if p)


def _build_venue(row: list[dict], col_map: dict[str, int], is_hcm: bool, row_1indexed: int, tab_name: str, city: str) -> dict:
    """Build the top-level venue dict from a parent row."""
    def _opt(field: str, label: str) -> str:
        idx = col_map.get(field)
        if idx is None:
            return ""
        val = _cell_text(row, idx)
        return f"{label}: {val}" if val else ""

    accommodation_text = _join_nonempty(
        _opt("accommodation_villa", "Villa"),
        _opt("accommodation_residence", "Residence"),
        _opt("accommodation_hotel_room", "Hotel"),
    )
    fnb_text = _join_nonempty(
        f"Canapes: {_cell_text(row, col_map['fnb_canapes'])}" if _cell_text(row, col_map["fnb_canapes"]) else "",
        f"Menu: {_cell_text(row, col_map['fnb_menu'])}" if _cell_text(row, col_map["fnb_menu"]) else "",
        f"Drink: {_cell_text(row, col_map['fnb_drink'])}" if _cell_text(row, col_map["fnb_drink"]) else "",
    )
    after_party = _cell_text(row, col_map["after_party"]) if "after_party" in col_map else None

    area = _build_area(row, col_map)
    areas = [area] if area["area_name_text"] else []

    return {
        "city": city,
        "tab_name": tab_name,
        "source_row": row_1indexed,
        "location_subarea": _cell_text(row, col_map["location"]) if "location" in col_map else None,
        "venue_name_raw": _cell_text(row, col_map["venue_name"]),
        "venue_name_url": _cell_url(row, col_map["venue_name"]),
        "type_of_venue_raw": _cell_text(row, col_map["type_of_venue"]),
        "price_range_raw": _cell_text(row, col_map["price_range"]),
        "wedding_package_text": _cell_text(row, col_map["wedding_package"]),
        "wedding_package_url": _cell_url(row, col_map["wedding_package"]),
        "insights_text": _cell_text(row, col_map["insights"]),
        "accommodation_text": accommodation_text,
        "fnb_text": fnb_text,
        "av_text": _cell_text(row, col_map["av"]),
        "facility_text": _cell_text(row, col_map["facility"]),
        "after_party_text": after_party if after_party else None,
        "address_contact_raw": _cell_text(row, col_map["address_contact"]),
        "areas": areas,
    }


def parse_tab(grid: list[list[dict]], tab_name: str) -> list[dict]:
    """Parse a raw 2-D grid into a list of venue dicts.

    Args:
        grid: Output of sheets_reader.read_tab().
        tab_name: The exact tab name string.

    Returns:
        List of venue dicts, one per unique parent venue encountered.
    """
    if len(grid) < 3:
        return []

    city = TAB_TO_CITY.get(tab_name, tab_name.strip())
    is_hcm = tab_name == "HCM\n"

    # Two header rows: index 0 (group headers) and index 1 (sub-headers).
    # We combine them column-by-column to build a single header for matching.
    # Data starts at index 2 (sheet row 3).
    num_header_rows = 2
    max_cols = max(
        (len(grid[r]) for r in range(min(num_header_rows, len(grid)))),
        default=0,
    )
    header_row_combined = []
    for col_idx in range(max_cols):
        texts = []
        for row_idx in range(num_header_rows):
            if col_idx < len(grid[row_idx]):
                t = grid[row_idx][col_idx]["text"].strip()
                if t:
                    texts.append(t)
        combined_text = "\n".join(texts)
        url = None
        for row_idx in range(num_header_rows):
            if col_idx < len(grid[row_idx]) and grid[row_idx][col_idx]["url"]:
                url = grid[row_idx][col_idx]["url"]
                break
        header_row_combined.append({"text": combined_text, "url": url})

    col_map = _build_column_map(header_row_combined, tab_name, is_hcm)

    venues: list[dict] = []
    current_venue: Optional[dict] = None

    data_start = num_header_rows
    for row_idx in range(data_start, len(grid)):
        row = grid[row_idx]
        venue_name = _cell_text(row, col_map["venue_name"])

        if venue_name:
            # New parent venue
            if current_venue is not None:
                venues.append(current_venue)
            sheet_row = row_idx + 1  # 1-indexed
            current_venue = _build_venue(row, col_map, is_hcm, sheet_row, tab_name, city)
        else:
            # Child row — only add if there's an area name
            if current_venue is None:
                continue
            area_name = _cell_text(row, col_map["area_name"])
            if not area_name:
                continue
            current_venue["areas"].append(_build_area(row, col_map))

    if current_venue is not None:
        venues.append(current_venue)

    return venues
