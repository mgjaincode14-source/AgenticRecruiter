from fastapi import FastAPI, HTTPException, BackgroundTasks, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import os
import json
import shutil

from databaseConnect import get_all_candidates, get_pending_candidates, get_candidate_by_id
from databaseInterview import (
    get_questions,
    save_questions,
    get_interview_timer,
    save_interview_timer,
    save_candidate_interview,
    get_interview_by_candidate
)
from tools.interviewAgent import run_interview_evaluation
from formReader import sync_form_to_db
from agent.hiringAgent import run_hiring_agent

app = FastAPI()

# Add CORS so the Vite React frontend can make requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure recordings directory exists and mount it
RECORDINGS_DIR = os.path.join(os.path.dirname(__file__), "recordings")
os.makedirs(RECORDINGS_DIR, exist_ok=True)
app.mount("/recordings", StaticFiles(directory=RECORDINGS_DIR), name="recordings")

def load_job_description() -> str:
    jd_path = os.path.join(os.path.dirname(__file__), "jobDescription.txt")
    if not os.path.exists(jd_path):
        return ""
    with open(jd_path, "r", encoding="utf-8") as f:
        return f.read().strip()

def save_job_description(content: str) -> bool:
    jd_path = os.path.join(os.path.dirname(__file__), "jobDescription.txt")
    try:
        with open(jd_path, "w", encoding="utf-8") as f:
            f.write(content)
        return True
    except Exception as e:
        print(f"Error saving JD: {e}")
        return False

class JobDescriptionUpdate(BaseModel):
    content: str

class InterviewSettingsUpdate(BaseModel):
    questions: list[str]
    timer_limit: int  # limit in seconds

@app.get("/api/interview/settings")
def get_interview_settings():
    questions = [q["question_text"] for q in get_questions()]
    timer_limit = get_interview_timer()
    return {"questions": questions, "timer_limit": timer_limit}

@app.post("/api/interview/settings")
def update_interview_settings(settings: InterviewSettingsUpdate):
    success_questions = save_questions(settings.questions)
    success_timer = save_interview_timer(settings.timer_limit)
    if success_questions and success_timer:
        return {"status": "success"}
    raise HTTPException(status_code=500, detail="Failed to save interview settings")

@app.get("/api/candidates")
def get_candidates():
    candidates = get_all_candidates()
    try:
        from databaseConnect import supabase
        interviews = supabase.table("interviewed_candidates").select("*").execute().data
        # Map interviews by candidate_id
        interview_map = {item["candidate_id"]: item for item in interviews}
        for c in candidates:
            c_id = c["id"]
            if c_id in interview_map:
                item = interview_map[c_id]
                c["interview_score"] = item.get("interview_score", -1)
                c["interview_reasoning"] = item.get("interview_reasoning")
                c["interview_transcript"] = item.get("transcript")
                c["interview_recording_url"] = item.get("recording_url")
                c["interview_status"] = item.get("interview_status")
                c["interview_shortlisted"] = item.get("shortlisted", False)
            else:
                c["interview_score"] = -1
                c["interview_reasoning"] = None
                c["interview_transcript"] = None
                c["interview_recording_url"] = None
                c["interview_status"] = None
                c["interview_shortlisted"] = False
    except Exception as e:
        print(f"[API] Error merging interview data: {e}")
    return {"candidates": candidates}

@app.get("/api/candidate/{candidate_id}/form-url")
def get_candidate_form_url(candidate_id: int):
    """
    Dynamically look up a candidate's specific row in the Google Sheet
    by matching their email, and return a direct deep-link URL.
    Works for all existing candidates — no DB migration needed.
    """
    candidate = get_candidate_by_id(candidate_id)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")

    email = (candidate.get("email") or "").strip().lower()

    # If we already stored the URL (new candidates after the sync update), use it
    if candidate.get("form_sheet_url") and candidate.get("form_row"):
        url = f"{candidate['form_sheet_url']}#gid=0&range=A{candidate['form_row']}"
        return {"url": url}

    # Otherwise fall back to a live lookup in the Google Sheet
    try:
        from formReader import get_sheet, COL_EMAIL
        sheet = get_sheet()
        rows = sheet.get_all_values()
        spreadsheet_url = (
            f"https://docs.google.com/spreadsheets/d/{sheet.spreadsheet.id}/edit"
        )

        # Search for candidate email in data rows (skip header row at index 0)
        for idx, row in enumerate(rows[1:], start=2):  # row 2 is first data row
            try:
                row_email = row[COL_EMAIL].strip().lower()
            except IndexError:
                continue
            if row_email == email:
                return {"url": f"{spreadsheet_url}#gid=0&range=A{idx}"}

        # Email not found — return the sheet root so HR can at least search manually
        return {"url": spreadsheet_url, "note": "Row not found; opening sheet root"}

    except Exception as e:
        print(f"[API] form-url lookup error for candidate {candidate_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Could not access Google Sheet: {str(e)}"
        )


@app.get("/api/job-description")
def get_jd():
    return {"content": load_job_description()}

@app.post("/api/job-description")
def update_jd(jd: JobDescriptionUpdate):
    if save_job_description(jd.content):
        return {"status": "success"}
    raise HTTPException(status_code=500, detail="Failed to save job description")

@app.post("/api/sync")
def sync_candidates():
    new_ids = sync_form_to_db()
    return {"status": "success", "new_candidates_count": len(new_ids), "new_ids": new_ids}

def evaluate_single_candidate(candidate_id: int):
    candidates = get_pending_candidates()
    candidate = next((c for c in candidates if c["id"] == candidate_id), None)
    if not candidate:
        print(f"Candidate {candidate_id} not found or not pending.")
        return
    jd = load_job_description()
    try:
        run_hiring_agent(candidate, jd)
    except Exception as e:
        print(f"Error evaluating candidate {candidate_id}: {e}")

def process_interview_eval_in_background(candidate_id: int):
    jd = load_job_description()
    try:
        from databaseInterview import get_interview_by_candidate, save_candidate_interview, get_questions
        from tools.transcription import transcribe_audio_with_groq, segment_transcript_to_qa
        
        # 1. Fetch saved candidate recording and browser draft transcript
        interview_data = get_interview_by_candidate(candidate_id)
        if interview_data and interview_data.get("recording_url"):
            # Construct the absolute path to the local audio file
            rel_path = interview_data["recording_url"].lstrip("/")
            file_path = os.path.join(os.path.dirname(__file__), rel_path)
            
            print(f"[Background STT] Transcribing audio with Groq Whisper for candidate {candidate_id} | Path: {file_path}")
            full_transcript = transcribe_audio_with_groq(file_path)
            
            if full_transcript:
                # Get the active questions list
                questions_list = [q["question_text"] for q in get_questions()]
                browser_transcript = interview_data.get("transcript") or []
                
                print(f"[Background STT] Aligning and healing transcript using Llama-3.3...")
                healed_transcript = segment_transcript_to_qa(full_transcript, questions_list, browser_transcript)
                
                if healed_transcript:
                    print(f"[Background STT] Saving high-accuracy transcript to Supabase interviewed_candidates...")
                    # Save transcript with custom key order
                    save_candidate_interview(candidate_id, healed_transcript, interview_data["recording_url"])
                    
        # 2. Trigger the AI Interview Evaluation Agent
        run_interview_evaluation(candidate_id, jd)
    except Exception as e:
        print(f"[Background Interview Eval] Error: {e}")

@app.post("/api/interview/transcribe-chunk")
async def transcribe_chunk(audio: UploadFile = File(...)):
    """
    Receives a small audio chunk from the frontend (one question's recording),
    runs Groq Whisper + LLM correction, and returns the accurate transcript text.
    Called per-question after the candidate clicks Stop Recording.
    """
    import tempfile
    from tools.transcription import transcribe_audio_with_groq, correct_technical_terms

    suffix = os.path.splitext(audio.filename or "chunk.webm")[1] or ".webm"
    tmp_path = None
    try:
        content = await audio.read()
        print(f"[Transcribe Chunk] Received audio chunk: {len(content)} bytes, suffix={suffix}")

        if not content or len(content) < 100:
            print("[Transcribe Chunk] Empty or too-small audio chunk. Returning empty.")
            return {"transcript": "", "error": "Empty audio chunk — ensure microphone is active"}

        # Write to a persistent temp file (flush + close before Whisper reads it)
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp_path = tmp.name
            tmp.write(content)
            tmp.flush()

        print(f"[Transcribe Chunk] Saved to temp file: {tmp_path} ({os.path.getsize(tmp_path)} bytes)")

        # Step 1: Whisper transcription (with tech-term prompt hint)
        raw_transcript = transcribe_audio_with_groq(tmp_path)
        print(f"[Transcribe Chunk] Whisper raw: '{raw_transcript[:200]}'")

        if not raw_transcript:
            return {"transcript": "", "raw": "", "error": "Whisper returned empty — try speaking louder"}

        # Step 2: LLM technical term correction
        corrected = correct_technical_terms(raw_transcript)
        print(f"[Transcribe Chunk] LLM corrected: '{corrected[:200]}'")

        return {"transcript": corrected, "raw": raw_transcript}

    except Exception as e:
        print(f"[Transcribe Chunk] Error: {e}")
        import traceback
        traceback.print_exc()
        return {"transcript": "", "error": str(e)}
    finally:
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except Exception:
                pass


@app.get("/api/candidate/{candidate_id}/interview/check")
def check_interview_status(candidate_id: int):
    candidate = get_candidate_by_id(candidate_id)
    if not candidate:
        return {"allowed": False, "reason": "not_found", "message": "Candidate not found."}
    
    stage = (candidate.get("stage") or "").lower()
    if stage in ["interview_completed", "interview_passed", "interview_failed"]:
        return {"allowed": False, "reason": "already_submitted", "message": "You have already completed this interview. Multiple attempts are not allowed."}
    
    existing = get_interview_by_candidate(candidate_id)
    if existing:
        return {"allowed": False, "reason": "already_submitted", "message": "You have already completed this interview. Multiple attempts are not allowed."}

    if stage not in ["shortlisted", "assessment_sent", "email_sent", "invited"]:
        return {"allowed": False, "reason": "not_eligible", "message": "You are not eligible for this interview round."}
        
    return {"allowed": True, "message": "Candidate is eligible to start the interview."}

@app.post("/api/candidate/{candidate_id}/interview/submit")
async def submit_interview(
    candidate_id: int,
    background_tasks: BackgroundTasks,
    transcript: str = Form(...)
):
    candidate = get_candidate_by_id(candidate_id)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
        
    # Prevent multiple submissions
    existing = get_interview_by_candidate(candidate_id)
    if existing:
        raise HTTPException(status_code=400, detail="Interview already completed. Multiple submissions are not allowed.")
        
    stage = (candidate.get("stage") or "").lower()
    if stage in ["interview_completed", "interview_passed", "interview_failed"]:
        raise HTTPException(status_code=400, detail="Interview already completed. Multiple submissions are not allowed.")
    
    try:
        parsed_transcript = json.loads(transcript)
    except Exception as e:
        raise HTTPException(status_code=400, detail="Invalid transcript format. Must be JSON.")

    recording_url = ""
    success = save_candidate_interview(candidate_id, parsed_transcript, recording_url)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to save interview data to Supabase.")

    from databaseConnect import update_stage
    update_stage(candidate_id, "interview_completed")

    background_tasks.add_task(process_interview_eval_in_background, candidate_id)

    return {"status": "success", "message": "Interview submitted successfully and queued for evaluation."}

@app.post("/api/evaluate/{candidate_id}")
def evaluate_candidate(candidate_id: int, background_tasks: BackgroundTasks):
    candidate = get_candidate_by_id(candidate_id)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")

    jd = load_job_description()
    if not jd:
        raise HTTPException(status_code=400, detail="Job description is empty")

    def run_eval_in_background(cand, job_desc):
        try:
            print(f"[BG Eval] Starting evaluation for candidate {cand['id']} ({cand.get('name')})")
            run_hiring_agent(cand, job_desc)
            print(f"[BG Eval] Finished evaluation for candidate {cand['id']}")
        except Exception as e:
            print(f"[BG Eval] Error evaluating candidate {cand['id']}: {e}")

    background_tasks.add_task(run_eval_in_background, candidate, jd)
    return {"status": "queued", "message": f"Evaluation started for candidate {candidate_id}. Refresh in 30–60 seconds to see results."}

@app.post("/api/evaluate-all")
def evaluate_all(background_tasks: BackgroundTasks):
    candidates = get_pending_candidates()
    if not candidates:
        return {"status": "success", "message": "No pending candidates to evaluate."}
    
    jd = load_job_description()
    if not jd:
        raise HTTPException(status_code=400, detail="Job description is empty")

    results = []
    for candidate in candidates:
        try:
            decision = run_hiring_agent(candidate, jd)
            results.append({"candidate_id": candidate["id"], "status": "success"})
        except Exception as e:
            print(f"[API] Error evaluating candidate {candidate.get('name')} (ID: {candidate['id']}): {e}")
            import traceback
            traceback.print_exc()
            results.append({"candidate_id": candidate["id"], "status": "error", "error": str(e)})

    return {"status": "success", "evaluated_count": len(candidates), "results": results}

@app.post("/api/run-pipeline")
def run_pipeline(background_tasks: BackgroundTasks):
    # This mirrors the logic in main.py
    # 1. Load job description
    jd = load_job_description()
    if not jd:
        raise HTTPException(status_code=400, detail="Job description is empty. Please add it first.")

    # 2. Sync Google form
    try:
        new_ids = sync_form_to_db()
    except Exception as e:
        print(f"[API] Error syncing form: {e}")
        # Continue even if sync fails, might just be no new entries or network error

    # 3. Get pending candidates
    candidates = get_pending_candidates()
    if not candidates:
        return {"status": "success", "message": "No pending candidates to evaluate."}

    # 4. Evaluate candidates
    results = []
    for candidate in candidates:
        try:
            decision = run_hiring_agent(candidate, jd)
            results.append({"candidate_id": candidate["id"], "status": "success"})
        except Exception as e:
            print(f"[API] Error in pipeline evaluation for candidate {candidate.get('name')} (ID: {candidate['id']}): {e}")
            import traceback
            traceback.print_exc()
            results.append({"candidate_id": candidate["id"], "status": "error", "error": str(e)})

    return {"status": "success", "evaluated_count": len(candidates), "results": results}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
