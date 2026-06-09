from dotenv import load_dotenv
load_dotenv()

import os
from databaseConnect import get_pending_candidates
from formReader import sync_form_to_db
from agent.hiringAgent  import run_hiring_agent 


def load_job_description() -> str:
    jd_path = os.path.join(os.path.dirname(__file__), "jobDescription.txt")

    if not os.path.exists(jd_path):
        print("[Main] ERROR: jobDescription.txt not found.")
        print("[Main] Create a jobDescription.txt file in your project root.")
        exit(1)

    with open(jd_path, "r", encoding="utf-8") as f:
        content = f.read().strip()

    if not content:
        print("[Main] ERROR: jobDescription.txt is empty.")
        print("[Main] Add the job description and run again.")
        exit(1)

    print(f"[Main] Job description loaded ({len(content)} characters)")
    return content


# ══════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════
def main():

    print("=" * 55)
    print("STEP 0 — Loading job description")
    print("=" * 55)
    job_description = load_job_description()
    print(f"[Main] JD preview: {job_description[:80]}...")

    print("\n" + "=" * 55)
    print("STEP 1 — Syncing Google Form responses")
    print("=" * 55)
    new_ids = sync_form_to_db()
    if new_ids:
        print(f"[Main] New candidates added: {new_ids}")
    else:
        print("[Main] No new candidates from form.")

    print("\n" + "=" * 55)
    print("STEP 2 — Fetching pending candidates")
    print("=" * 55)
    candidates = get_pending_candidates()

    if not candidates:
        print("[Main] No pending candidates. Exiting.")
        return

    print(f"[Main] {len(candidates)} candidate(s) to process.")

    print("\n" + "=" * 55)
    print("STEP 3 — Running hiring agent")
    print("=" * 55)

    for candidate in candidates:
        print(f"\n{'─' * 55}")
        print(f"[Main] Processing: {candidate['name']} "
              f"| {candidate['email']}")
        print(f"{'─' * 55}")

        print(f"[Main] id={candidate['id']} sent to agent.")
        try:
            decision = run_hiring_agent(candidate, job_description)
            print(f"[Main] Agent decision for {candidate['name']}:\n{decision}")
        except Exception as e:
            print(f"[Main] Error processing candidate {candidate['name']}: {e}")

    print("\n[Main] Done.")


if __name__ == "__main__":
    main()