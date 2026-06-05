import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL: str = os.getenv("SUPABASE_URL")
SUPABASE_KEY: str = os.getenv("SUPABASE_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def is_duplicate(email: str) -> bool:
    try:
        response = (
            supabase.table("candidates")
            .select("id")
            .eq("email", email.strip().lower())
            .limit(1)
            .execute()
        )
        return len(response.data) > 0
    except Exception as e:
        print(f"[DB] is_duplicate error: {e}")
        return False

def save_candidate(candidate: dict) -> int:
    try:
        row = {
            "name": candidate.get("name","").strip(),
            "email": candidate.get("email","").strip().lower(),
            "github_username": candidate.get("github_username",""),
            "leetcode_username": candidate.get("leetcode_username",""),
            "resume_url": candidate.get("resume_url",""),
            "linkedin_url": candidate.get("linkedin_url",""),
            "stage": "pending",
        }
        response = (
            supabase.table("candidates")
            .insert(row)
            .execute()
        )
        db_id = response.data[0]["id"]
        print(f"[DB] Saved: {row['name']} | id={db_id}")
        return db_id
    except Exception as e:
        print(f"[DB] save_candidate error: {e}")
        return -1

def get_pending_candidates() -> list[dict]:
    try:
        response = (
            supabase.table("candidates")
            .select("*")
            .eq("stage", "pending")
            .order("created_at", desc=False)
            .execute()
        )
        return response.data
    except Exception as e:
        print(f"[DB] get_pending_candidates error: {e}")
        return []


def get_candidate_by_id(db_id: int) -> dict:
    try:
        response = (
            supabase.table("candidates")
            .select("*")
            .eq("id", db_id)
            .limit(1)
            .execute()
        )
        return response.data[0] if response.data else {}
    except Exception as e:
        print(f"[DB] get_candidate_by_id error: {e}")
        return {}


# ══════════════════════════════════════════════════════
# UPDATE SCORES — called by score_tool.py
# ══════════════════════════════════════════════════════
def update_scores(db_id: int, candidate: dict):
    try:
        supabase.table("candidates").update({
            "resume_score": candidate.get("resume_score", 0),
            "github_score": candidate.get("github_score", 0),
            "coding_score": candidate.get("coding_score", 0),
            "final_score":  candidate.get("final_score", 0),
            "resume_reasoning": candidate.get("resume_reasoning", ""),
            "github_reasoning": candidate.get("github_reasoning", ""),
            "coding_reasoning": candidate.get("coding_reasoning", ""),
        }).eq("id", db_id).execute()

        print(f"[DB] Scores updated | id={db_id} "
              f"R={candidate.get('resume_score')} "
              f"G={candidate.get('github_score')} "
              f"C={candidate.get('coding_score')} "
              f"Final={candidate.get('final_score')}")

    except Exception as e:
        print(f"[DB] update_scores error: {e}")


# ══════════════════════════════════════════════════════
# UPDATE STAGE — called at every pipeline transition
# ══════════════════════════════════════════════════════
def update_stage(db_id: int, stage: str, reason: str = None):
    try:
        supabase.table("candidates").update({
            "stage":            stage,
            "rejection_reason": reason,
        }).eq("id", db_id).execute()

        print(f"[DB] id={db_id} | stage: {stage}")
    except Exception as e:
        print(f"[DB] update_stage error: {e}")


# ══════════════════════════════════════════════════════
# FLAGS — called by email_tool.py and offer_tool.py
# ══════════════════════════════════════════════════════
def mark_email_sent(db_id: int):
    
    try:
        supabase.table("candidates").update({
            "email_sent": True
        }).eq("id", db_id).execute()
        print(f"[DB] email_sent = True | id={db_id}")
    except Exception as e:
        print(f"[DB] mark_email_sent error: {e}")


def mark_offer_sent(db_id: int):

    try:
        supabase.table("candidates").update({
            "offer_sent": True
        }).eq("id", db_id).execute()
        print(f"[DB] offer_sent = True | id={db_id}")
    except Exception as e:
        print(f"[DB] mark_offer_sent error: {e}")