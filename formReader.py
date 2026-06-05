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
COL_LINKEDIN   = 4   # LinkedIn Profile URL
COL_RESUME_URL = 6   # Resume Link
COL_GITHUB     = 3   # GitHub Profile URL
COL_CODING   = 5   # Coding Platform Username


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
def parse_row(row: list) -> dict:
    def safe_get(index: int) -> str:
        try:
            return str(row[index]).strip()
        except IndexError:
            return ""

    return {
        "name":safe_get(COL_NAME),
        "email":safe_get(COL_EMAIL).lower(),
        "github_username":safe_get(COL_GITHUB),
        "linkedin_url":safe_get(COL_LINKEDIN),
        "leetcode_username":safe_get(COL_CODING),
        "resume_url":safe_get(COL_RESUME_URL),
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
        print(f"[Forms] Skipping {candidate.get('email')} — no resume link")
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
    except Exception as e:
        print(f"[Forms] Failed to read Google Sheet: {e}")
        return []

    if len(rows) <= 1:
        print("[Forms] No submissions found.")
        return []

    data_rows  = rows[1:]    # skip header row
    new_db_ids = []

    print(f"[Forms] {len(data_rows)} total submission(s) found in sheet.")

    for row in data_rows:

        # Skip completely empty rows
        if not any(cell.strip() for cell in row):
            continue

        candidate = parse_row(row)

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
            print(f"[Forms] ✓ Saved: {candidate['name']} "
                  f"({candidate['email']}) | id={db_id}")
        else:
            print(f"[Forms] ✗ Failed: {candidate['email']}")

    print(f"\n[Forms] Sync complete — "
          f"{len(new_db_ids)} new candidate(s) added.\n")
    return new_db_ids