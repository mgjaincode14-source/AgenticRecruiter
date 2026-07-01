# forms_reader.py
"""
Reads candidate submissions from Google Sheet linked to Google Form.
Saves each new non-duplicate candidate into Supabase.

Setup:
1. Link Google Form to Google Sheet
   (Form → Responses → Sheets icon)
2. Go to console.cloud.google.com
3. Create project → Enable Google Sheets API
4. Create Service Account → download credentials.json
5. Share Google Sheet with service account email
6. Place credentials.json in project root
7. pip install gspread google-auth

Form Fields (updated):
  Col 0 — Timestamp
  Col 1 — Full Name
  Col 2 — Email Address
  Col 3 — LinkedIn Profile URL
  Col 4 — Resume Upload (PDF)  ← previously was "Resume Link URL"
  Col 5 — GitHub Profile URL
  Col 6 — Coding Platform URL

Note on legacy submissions:
  Candidates who filled the OLD form submitted a manually-pasted
  Google Drive URL in col 4. Those rows still work — resume_url
  holds a Drive share link and resumeScan.py handles it the same way.

  Candidates on the NEW form upload a PDF directly. Google Forms
  stores uploaded files as auto-generated Drive URLs (open?id=...)
  in the same col 4. resumeScan.py is updated to handle both formats.
"""

import gspread
from google.oauth2.service_account import Credentials
from databaseConnect import is_duplicate, save_candidate

# ══════════════════════════════════════════════════════
# CONFIG
# ══════════════════════════════════════════════════════
CREDENTIALS_FILE = "credentials.json"
SHEET_NAME       = "Bitcot Technologies Pvt Ltd (Responses)"

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets.readonly",
    "https://www.googleapis.com/auth/drive.readonly",
]

COL_TIMESTAMP  = 0
COL_NAME       = 1   # Full Name
COL_EMAIL      = 2   # Email Address
COL_LINKEDIN   = 3   # LinkedIn Profile URL
COL_RESUME     = 4   # Resume Upload (PDF) — stores a Google Drive URL
COL_GITHUB     = 5   # GitHub Profile URL
COL_CODING     = 6   # Coding Platform URL


# ══════════════════════════════════════════════════════
# CONNECT TO GOOGLE SHEET
# ══════════════════════════════════════════════════════
def get_sheet():
    creds  = Credentials.from_service_account_file(
                 CREDENTIALS_FILE,
                 scopes=SCOPES
             )
    client = gspread.authorize(creds)
    sheet  = client.open(SHEET_NAME).sheet1
    return sheet


# ══════════════════════════════════════════════════════
# PARSE ONE ROW
# ══════════════════════════════════════════════════════
def parse_row(row: list, row_number: int = None, sheet_url: str = None) -> dict:
    def safe_get(index: int) -> str:
        try:
            return str(row[index]).strip()
        except IndexError:
            return ""

    return {
        "name":              safe_get(COL_NAME),
        "email":             safe_get(COL_EMAIL).lower(),
        "github_username":   safe_get(COL_GITHUB),
        "linkedin_url":      safe_get(COL_LINKEDIN),
        "leetcode_username": safe_get(COL_CODING),
        # resume_url stores the Drive URL whether it came from a manual
        # link (old form) or a PDF upload (new form — auto Drive URL).
        "resume_url":        safe_get(COL_RESUME),
        "form_row":          row_number,
        "form_sheet_url":    sheet_url,
    }


# ══════════════════════════════════════════════════════
# VALIDATE ROW
# ══════════════════════════════════════════════════════
def is_valid(candidate: dict) -> bool:

    if not candidate.get("name"):
        print(f"[Forms] Skipping — name is empty")
        return False

    if not candidate.get("email"):
        print(f"[Forms] Skipping — email is empty")
        return False

    if "@" not in candidate.get("email", ""):
        print(f"[Forms] Skipping — invalid email: {candidate.get('email')}")
        return False

    if not candidate.get("resume_url"):
        print(f"[Forms] Skipping {candidate.get('email')} — no resume uploaded")
        return False

    return True


# ══════════════════════════════════════════════════════
# MAIN SYNC FUNCTION — called by main.py
# ══════════════════════════════════════════════════════
def sync_form_to_db() -> list[int]:
    """
    1. Reads all rows from Google Sheet
    2. Skips header row
    3. Skips empty or invalid rows
    4. Skips duplicates already in Supabase
    5. Saves new candidates to Supabase
    6. Returns list of new db_ids created
    """
    print("\n[Forms] Connecting to Google Sheet...")

    try:
        sheet = get_sheet()
        rows  = sheet.get_all_values()
        # Build a direct URL to the spreadsheet for linking back to form responses
        spreadsheet = sheet.spreadsheet
        sheet_url = f"https://docs.google.com/spreadsheets/d/{spreadsheet.id}/edit"
    except Exception as e:
        print(f"[Forms] Failed to read Google Sheet: {e}")
        return []

    if len(rows) <= 1:
        print("[Forms] No submissions found.")
        return []

    data_rows  = rows[1:]    # skip header row
    new_db_ids = []

    print(f"[Forms] {len(data_rows)} total submission(s) found in sheet.")

    for idx, row in enumerate(data_rows):
        # row_number is 1-indexed in the sheet; header is row 1, data starts at row 2
        sheet_row_number = idx + 2

        # Skip completely empty rows
        if not any(cell.strip() for cell in row):
            continue

        candidate = parse_row(row, row_number=sheet_row_number, sheet_url=sheet_url)

        # Validate required fields
        if not is_valid(candidate):
            continue

        # Duplicate check — calls database.py
        if is_duplicate(candidate["email"]):
            print(f"[Forms] Duplicate skipped: {candidate['email']}")
            continue

        # Save to Supabase — calls database.py
        db_id = save_candidate(candidate)

        if db_id != -1:
            new_db_ids.append(db_id)
            print(f"[Forms] [OK] Saved: {candidate['name']} "
                  f"({candidate['email']}) | id={db_id} | sheet_row={sheet_row_number}")
        else:
            print(f"[Forms] [FAIL] Failed: {candidate['email']}")

    print(f"\n[Forms] Sync complete — "
          f"{len(new_db_ids)} new candidate(s) added.\n")
    return new_db_ids