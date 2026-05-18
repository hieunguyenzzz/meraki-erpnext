"""
Reads a Google Sheets tab and returns a 2-D grid of {text, url} cells.

Two API calls per tab:
  1. values.get with FORMATTED_VALUE → display text
  2. spreadsheets.get with includeGridData → per-cell hyperlinks

The two results are merged: every cell has {"text": str, "url": str | None}.
"""

import os
from pathlib import Path

from google.oauth2 import service_account
from googleapiclient.discovery import build


_SERVICE_ACCOUNT_FILE = Path.home() / ".config" / "gcloud" / "service-accounts" / "sheets-api-service.json"
_SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"]


def _build_service():
    creds = service_account.Credentials.from_service_account_file(
        str(_SERVICE_ACCOUNT_FILE), scopes=_SCOPES
    )
    return build("sheets", "v4", credentials=creds, cache_discovery=False)


def _extract_cell_url(cell_data: dict) -> str | None:
    """Pull the first hyperlink from a raw cell object (gridData form)."""
    if not cell_data:
        return None

    # Top-level hyperlink (most common)
    url = cell_data.get("hyperlink")
    if url:
        return url

    # Hyperlinks embedded in textFormatRuns
    for run in cell_data.get("textFormatRuns", []):
        uri = run.get("format", {}).get("link", {}).get("uri")
        if uri:
            return uri

    return None


def read_tab(spreadsheet_id: str, tab_name: str) -> list[list[dict]]:
    """Read one tab and return a 2-D grid of {text, url} cells.

    Args:
        spreadsheet_id: Google Sheets file ID.
        tab_name: Exact tab name as it appears in the sheet (including trailing
                  newline for "HCM\\n" if that's the actual name).

    Returns:
        List of rows; each row is a list of {"text": str, "url": str|None}.
        Rows are 0-indexed. Cells are right-padded to the max column count seen
        in the values response.
    """
    service = _build_service()
    sheets = service.spreadsheets()

    # Pass 1: formatted display text
    values_resp = sheets.values().get(
        spreadsheetId=spreadsheet_id,
        range=tab_name,
        valueRenderOption="FORMATTED_VALUE",
    ).execute()

    raw_values = values_resp.get("values", [])
    if not raw_values:
        return []

    max_cols = max(len(row) for row in raw_values)

    # Pad every row to max_cols so column indices are stable
    padded_values = [row + [""] * (max_cols - len(row)) for row in raw_values]

    # Pass 2: grid data for hyperlinks
    grid_resp = sheets.get(
        spreadsheetId=spreadsheet_id,
        ranges=[tab_name],
        includeGridData=True,
        fields="sheets(data(rowData(values(hyperlink,textFormatRuns(format(link(uri)))))))",
    ).execute()

    grid_rows = []
    for sheet in grid_resp.get("sheets", []):
        for data_range in sheet.get("data", []):
            grid_rows.extend(data_range.get("rowData", []))

    # Build merged result
    result = []
    for row_idx, row in enumerate(padded_values):
        grid_row = grid_rows[row_idx] if row_idx < len(grid_rows) else {}
        grid_cells = grid_row.get("values", []) if grid_row else []

        merged_row = []
        for col_idx, text in enumerate(row):
            cell_data = grid_cells[col_idx] if col_idx < len(grid_cells) else {}
            url = _extract_cell_url(cell_data)
            merged_row.append({"text": str(text), "url": url})

        result.append(merged_row)

    return result
