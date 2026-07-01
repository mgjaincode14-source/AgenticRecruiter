import os
import json
from dotenv import load_dotenv
load_dotenv()

from langchain_groq import ChatGroq
from databaseConnect import get_candidate_by_id, update_stage
from databaseInterview import get_interview_by_candidate, update_interview_score

# ══════════════════════════════════════════════════════
# LLM
# ══════════════════════════════════════════════════════
llm = ChatGroq(
    model       = "llama-3.3-70b-versatile",
    temperature = 0,  # Consistent, deterministic decisions
).with_fallbacks([
    ChatGroq(
        model       = "llama-3.1-8b-instant",
        temperature = 0,
    )
])

def run_interview_evaluation(candidate_id: int, job_description: str) -> dict:
    """
    Retrieves the candidate's interview responses and job description,
    runs the LLM agent to evaluate their verbal answers,
    updates the Supabase `shortlisted_candidates` table,
    and updates the candidate's recruitment stage.
    """
    print(f"\n[InterviewAgent] Starting interview evaluation for candidate ID: {candidate_id}")
    
    # 1. Fetch candidate info from Supabase
    candidate = get_candidate_by_id(candidate_id)
    if not candidate:
        print(f"[InterviewAgent] Error: Candidate {candidate_id} not found.")
        return {"error": "Candidate not found"}

    # 2. Fetch interview response from shortlisted_candidates table
    interview_data = get_interview_by_candidate(candidate_id)
    if not interview_data or not interview_data.get("transcript"):
        print(f"[InterviewAgent] Error: No interview response found for candidate {candidate_id}.")
        return {"error": "No interview transcript found"}

    transcript_list = interview_data["transcript"]
    
    # 3. Format transcript for the LLM
    formatted_transcript = ""
    for idx, item in enumerate(transcript_list, start=1):
        formatted_transcript += f"Question {idx}: {item.get('question', '')}\n"
        formatted_transcript += f"Candidate Verbal Answer: {item.get('answer', '')}\n"
        formatted_transcript += "—" * 40 + "\n"

    # 4. Construct prompt for evaluation
    prompt = f"""
You are an autonomous AI hiring agent. You are evaluating a candidate's verbal interview responses for a tech role.

ROLE / JOB DESCRIPTION:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{job_description}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CANDIDATE PROFILE SUMMARY:
- Name: {candidate.get('name')}
- Email: {candidate.get('email')}
- Resume Score: {candidate.get('resume_score')}/10
- Resume reasoning: {candidate.get('resume_reasoning')}
- GitHub Score: {candidate.get('github_score')}/10
- Coding Score: {candidate.get('coding_score')}/10

VERBAL INTERVIEW TRANSCRIPT (100% spoken by candidate):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{formatted_transcript}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Your task is to analyze the candidate's spoken responses for correctness, technical depth, and clarity.

NOTE ON TRANSCRIPT QUALITY:
The transcript above was generated using real-time browser Speech-to-Text. Because the candidate is discussing specialized technical topics, the browser speech engine may have phonetically misheard some technical jargon (e.g. transcribing "FastAPI" as "far API" or "fast eye", "SQL" as "sequel", "GitHub" as "get hub", etc.). Please use your advanced phonetic and contextual intelligence to understand what the candidate actually meant, and evaluate their knowledge fairly without penalizing them for transcription errors.

SCORING INSTRUCTIONS:
You must evaluate the actual content of the answers and compute a score from 0 to 10.
CRITICAL RULE: Evaluate the answers ONLY based on how well they address the specific question asked. Do NOT penalize the candidate if they don't mention every skill from the job description. 

You MUST provide a varied and deserving score based on this rubric:
- 0: The answers are completely blank, empty, or just say "[No spoken answer recorded]".
- 1-3: The candidate attempted an answer but it is nonsensical, completely wrong, or completely irrelevant to the question.
- 4-6: The candidate shows basic understanding but the answer is shallow, lacks depth, or has significant flaws.
- 7-8: The candidate gives good, technically sound, and accurate answers to the questions asked.
- 9-10: The candidate gives exceptional, highly detailed, and insightful answers that directly address the question flawlessly.

Do NOT default to a middle score like 4. Give 7-10 for good answers.

You MUST NOT output any conversational text. You MUST output ONLY a valid JSON object matching this exact format:
{{
  "interview_reasoning": "A 2-3 sentence explanation of your assessment.",
  "interview_score": 0
}}
"""

    try:
        response = llm.invoke(prompt)
        response_text = response.content.strip()
        
        # Robust JSON extraction
        import re
        match = re.search(r'\{.*\}', response_text, re.DOTALL)
        if match:
            clean_json = match.group(0)
        else:
            clean_json = response_text
            
        eval_result = json.loads(clean_json)
        score = int(eval_result.get("interview_score", 0))
        reasoning = str(eval_result.get("interview_reasoning", "No reasoning provided."))
        
        # 5. Save the score, reasoning, status, and shortlisted flags back to the interviewed_candidates table
        status = "cleared" if score >= 5 else "rejected"
        is_shortlisted = True if score >= 5 else False
        update_interview_score(candidate_id, score, reasoning, status, is_shortlisted)
        
        # 6. Update recruitment stage based on interview performance
        # Threshold: 5 or higher to pass
        if score >= 5:
            update_stage(candidate_id, "interview_passed")
            print(f"[InterviewAgent] Candidate {candidate_id} passed interview (Score: {score}/10)")
        else:
            update_stage(candidate_id, "interview_failed")
            print(f"[InterviewAgent] Candidate {candidate_id} failed interview (Score: {score}/10)")
            
        return {
            "status": "success",
            "interview_score": score,
            "interview_reasoning": reasoning
        }

    except Exception as e:
        print(f"[InterviewAgent] Error during evaluation of candidate {candidate_id}: {e}")
        # Save a fail-safe score and error reasoning so pipeline doesn't hang
        # Also include the raw response text if available for debugging
        error_details = str(e)
        if 'response_text' in locals() and response_text:
            error_details += f" | Raw response: {response_text[:200]}"
            
        update_interview_score(candidate_id, 0, f"Error evaluating interview answers: {error_details}", "rejected", False)
        update_stage(candidate_id, "interview_failed")
        return {"error": str(e)}
