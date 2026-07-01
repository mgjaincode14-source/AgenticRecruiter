import os
from databaseConnect import supabase

TIMER_FILE = os.path.join(os.path.dirname(__file__), "interview_timer.txt")
DEFAULT_TIMER_SECONDS = 120  # 2 minutes

def get_interview_timer() -> int:
    """Gets the HR configured timer limit for answering questions (in seconds)."""
    if os.path.exists(TIMER_FILE):
        try:
            with open(TIMER_FILE, "r") as f:
                return int(f.read().strip())
        except Exception as e:
            print(f"[DB Interview] Error reading timer file: {e}")
    return DEFAULT_TIMER_SECONDS

def save_interview_timer(seconds: int) -> bool:
    """Saves the HR configured timer limit (in seconds)."""
    try:
        with open(TIMER_FILE, "w") as f:
            f.write(str(seconds))
        return True
    except Exception as e:
        print(f"[DB Interview] Error writing timer file: {e}")
        return False

DEFAULT_QUESTIONS = [
    "Could you introduce yourself and describe a challenging technical project you worked on recently, detailing your role and the specific technologies you used?",
    "How do you approach debugging a complex, intermittent issue in a production system where logs are sparse?",
    "Explain the difference between SQL and NoSQL databases. In what scenario would you choose one over the other for a new project?",
    "How do you handle feedback or disagreements within a software engineering team to ensure project success and maintain a positive working environment?"
]

def get_questions() -> list[dict]:
    """Fetches the list of interview questions from Supabase."""
    try:
        response = (
            supabase.table("interview_questions")
            .select("*")
            .order("id", desc=False)
            .execute()
        )
        if not response.data:
            print("[DB Interview] No questions found in Supabase. Seeding default questions...")
            rows = [{"question_text": q} for q in DEFAULT_QUESTIONS]
            supabase.table("interview_questions").insert(rows).execute()
            # Refetch to get the auto-generated IDs
            response = (
                supabase.table("interview_questions")
                .select("*")
                .order("id", desc=False)
                .execute()
            )
        return response.data
    except Exception as e:
        print(f"[DB Interview] Error fetching questions: {e}")
        # Return fallback questions to prevent blocking the candidate interview flow
        return [{"id": i + 1, "question_text": q} for i, q in enumerate(DEFAULT_QUESTIONS)]

def save_questions(questions: list[str]) -> bool:
    """Replaces the existing interview questions with a new set."""
    try:
        # 1. Delete all existing questions
        # In PostgREST, to delete all, we can query neq("id", 0) since IDs are positive
        supabase.table("interview_questions").delete().neq("id", -1).execute()
        
        # 2. Insert new questions
        rows = [{"question_text": q.strip()} for q in questions if q.strip()]
        if rows:
            supabase.table("interview_questions").insert(rows).execute()
        return True
    except Exception as e:
        print(f"[DB Interview] Error saving questions: {e}")
        return False

def get_interview_by_candidate(candidate_id: int) -> dict:
    """Fetches candidate's interview transcripts and scores from Supabase."""
    try:
        response = (
            supabase.table("interviewed_candidates")
            .select("*")
            .eq("candidate_id", candidate_id)
            .limit(1)
            .execute()
        )
        return response.data[0] if response.data else {}
    except Exception as e:
        print(f"[DB Interview] Error fetching candidate interview details: {e}")
        return {}

def save_candidate_interview(candidate_id: int, transcript: list, recording_url: str) -> bool:
    """
    Inserts or updates the candidate's interview transcripts and audio recording link.
    Stores the transcript as a JSON list.
    """
    try:
        row = {
            "candidate_id": candidate_id,
            "transcript": transcript,  # Will be converted to JSON automatically by Supabase SDK
            "recording_url": recording_url,
            "interview_status": "pending",
            "shortlisted": False
        }
        # Check if already exists to decide insert or upsert/update
        existing = get_interview_by_candidate(candidate_id)
        if existing:
            supabase.table("interviewed_candidates").update({
                "transcript": transcript,
                "recording_url": recording_url
            }).eq("candidate_id", candidate_id).execute()
        else:
            supabase.table("interviewed_candidates").insert(row).execute()
        return True
    except Exception as e:
        print(f"[DB Interview] Error saving candidate interview responses: {e}")
        return False

def update_interview_score(candidate_id: int, score: int, reasoning: str, status: str, shortlisted: bool) -> bool:
    """Updates the candidate's AI interview score, reasoning, status, and shortlisted flags in Supabase."""
    try:
        supabase.table("interviewed_candidates").update({
            "interview_score": score,
            "interview_reasoning": reasoning,
            "interview_status": status,
            "shortlisted": shortlisted
        }).eq("candidate_id", candidate_id).execute()
        return True
    except Exception as e:
        print(f"[DB Interview] Error updating interview score: {e}")
        return False
