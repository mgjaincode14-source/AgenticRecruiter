# agent/hiring_agent.py
"""
The agentic core of AIHireAgent.

One LangChain AgentExecutor with all 5 tools.
The LLM reads the candidate record and decides:
  - which tools to call
  - in what order
  - what scores to assign based on its own reasoning
  - whether to shortlist or reject
  - whether to send the email

This is what makes the pipeline truly agentic —
the LLM drives every decision, tools just fetch data.
"""

import os
from dotenv import load_dotenv
load_dotenv()

from langchain_groq import ChatGroq
from langgraph.prebuilt import create_react_agent
from tools.resumeScan import scan_resume
from tools.githubScan import scan_github
from tools.leetcodeScan import scan_coding_profile
from tools.scoreEvaluation import compute_and_save_score
from tools.emails import send_assessment_email

# ══════════════════════════════════════════════════════
# TOOLS
# ══════════════════════════════════════════════════════
TOOLS = [
    scan_resume,
    scan_github,
    scan_coding_profile,
    compute_and_save_score,
    send_assessment_email,
]

# ══════════════════════════════════════════════════════
# SYSTEM PROMPT
# ══════════════════════════════════════════════════════
SYSTEM_PROMPT = """
You are an autonomous AI hiring agent for a tech company.

You will receive one candidate's complete details.
Your job is to evaluate them end-to-end using your tools
and make a final hiring decision.

CRITICAL RULE: You MUST call compute_and_save_score before writing any final report.
Do NOT write a summary or report without first calling compute_and_save_score.
Skipping this tool call means the candidate data is never saved — this is a failure.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 1 — SCAN ALL THREE PROFILES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Call all three scan tools:
  - scan_resume         with resume_url and job_description
  - scan_github         with github_url and job_description
  - scan_coding_profile with leetcode_username and job_description

Read everything returned. Do not skip any tool.
If a URL or username is missing, still call the tool —
it will return a score of 0 with an explanation.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 2 — ASSIGN SCORES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
After reading all three tool outputs, assign:
  - resume_score  (0 to 10)
  - github_score  (0 to 10)
  - coding_score  (0 to 10)

Scoring rules:
  0    : Tool returned invalid/missing/junk content (e.g. placeholder text, no resume, no GitHub, etc.)
  1–3  : Profile exists but shows no relevant skills, empty projects, or very weak match
  4–6  : Partial match / some relevant content with real skills or projects present
  7–8  : Good match / solid evidence of real experience matching the JD
  9–10 : Excellent match / outstanding and directly relevant experience

IMPORTANT: If the resume tool returns "RESUME CONTENT INVALID", assign resume_score = 0 immediately.
IMPORTANT: If the GitHub tool reports no repos or all-tutorial repos, assign github_score = 1–2 maximum.
IMPORTANT: Be strict. Do not inflate scores. Score based only on the actual content returned by the tools.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 3 — MANDATORY: SAVE SCORES VIA TOOL CALL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
You MUST call compute_and_save_score. This is NOT optional.
Do NOT skip this step. Do NOT write a summary without calling this tool first.

Call compute_and_save_score with:
  - db_id            (from the candidate details)
  - resume_score     (your assigned score)
  - github_score     (your assigned score)
  - coding_score     (your assigned score)
  - resume_reasoning (one sentence)
  - github_reasoning (one sentence)
  - coding_reasoning (one sentence)

The tool will compute:
  final = (0.5 x resume) + (0.4 x github) + (0.1 x coding)

It will return either SHORTLISTED or REJECTED.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 4 — ACT ON THE DECISION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
If SHORTLISTED:
  Call send_assessment_email with db_id, name, email.
  This sends the invitation and updates the database.

If REJECTED:
  Do not call send_assessment_email.
  Simply report the rejection with reason.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 5 — FINAL REPORT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Only after compute_and_save_score has been called, end with a clean summary:

CANDIDATE : <name>
EMAIL     : <email>
RESUME    : <score>/10 — <reasoning>
GITHUB    : <score>/10 — <reasoning>
CODING    : <score>/10 — <reasoning>
FINAL     : <score>/10
DECISION  : SHORTLISTED / REJECTED
ACTION    : Email sent / No email sent
"""

# ══════════════════════════════════════════════════════
# LLM — model rotation list (tried in order on rate limits)
# ══════════════════════════════════════════════════════
MODELS_TO_TRY = [
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "llama3-8b-8192",  # reliable fallback model
]

def _make_executor(model_name: str):
    llm = ChatGroq(model=model_name, temperature=0)
    return create_react_agent(model=llm, tools=TOOLS, prompt=SYSTEM_PROMPT)

hiring_executor = _make_executor(MODELS_TO_TRY[0])


# ══════════════════════════════════════════════════════
# MAIN FUNCTION — called by main.py for each candidate
# ══════════════════════════════════════════════════════
def run_hiring_agent(candidate: dict, job_description: str) -> str:
    """
    Runs the full agentic hiring pipeline for one candidate.
    Automatically rotates through fallback models if rate limits are hit.
    """

    # Build the input message the agent receives
    input_text = f"""
Evaluate this candidate for the role described in the job description.

CANDIDATE DETAILS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DB ID          : {candidate.get('id')}
Name           : {candidate.get('name')}
Email          : {candidate.get('email')}
GitHub URL     : {candidate.get('github_username', 'Not provided')}
LeetCode       : {candidate.get('leetcode_username', 'Not provided')}
Resume URL     : {candidate.get('resume_url', 'Not provided')}
LinkedIn       : {candidate.get('linkedin_url', 'Not provided')}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

JOB DESCRIPTION:
{job_description}

Begin evaluation now. Follow all 5 steps.
"""

    print(f"\n[Agent] Starting evaluation for: {candidate.get('name')}")

    final_output = None
    last_error = None

    for model_name in MODELS_TO_TRY:
        try:
            print(f"[Agent] Using model: {model_name}")
            executor = _make_executor(model_name)
            result = executor.invoke({"messages": [("user", input_text)]})
            final_output = result["messages"][-1].content
            print(f"[Agent] Evaluation complete with model: {model_name}")
            break  # success — stop trying models
        except Exception as e:
            err_str = str(e)
            if "429" in err_str or "rate_limit" in err_str.lower() or "rate limit" in err_str.lower():
                print(f"[Agent] Rate limit hit on {model_name}, trying next model...")
                last_error = e
                continue
            else:
                # Non-rate-limit error — raise immediately
                raise

    if final_output is None:
        raise Exception(f"All models rate limited. Last error: {last_error}")

    # ── Safety net: if agent skipped compute_and_save_score, parse and save manually ──
    import re
    db_id = candidate.get('id')
    from databaseConnect import get_candidate_by_id as _get, update_scores, update_stage
    refreshed = _get(db_id)
    if refreshed and refreshed.get('final_score', 0) == 0 and refreshed.get('stage') == 'pending':
        print(f"[Agent] WARNING: compute_and_save_score was NOT called. Parsing output to save scores manually.")
        try:
            def parse_score_and_reason(prefix, text):
                # Matches the score and any reasoning text until the end of the line
                # e.g. "RESUME : 4/10 — The resume has some relevant..."
                pattern = rf"{prefix}\s*:\s*(\d+)/10[^\w\n]*(.+?)(?=\n|$)"
                m = re.search(pattern, text, re.IGNORECASE)
                if m:
                    return int(m.group(1)), m.group(2).strip()
                # Fallback if reasoning isn't perfectly formatted
                pattern_simple = rf"{prefix}\s*:\s*(\d+)/10"
                m_simple = re.search(pattern_simple, text, re.IGNORECASE)
                score = int(m_simple.group(1)) if m_simple else 0
                return score, "Parsed from agent output."

            r_score, r_reason = parse_score_and_reason("RESUME", final_output)
            g_score, g_reason = parse_score_and_reason("GITHUB", final_output)
            c_score, c_reason = parse_score_and_reason("CODING", final_output)
            final = round((0.5 * r_score) + (0.4 * g_score) + (0.1 * c_score))

            update_scores(db_id, {
                'resume_score': r_score,
                'github_score': g_score,
                'coding_score': c_score,
                'final_score': final,
                'resume_reasoning': r_reason,
                'github_reasoning': g_reason,
                'coding_reasoning': c_reason,
            })
            if final >= 6:
                update_stage(db_id, 'invited')
            else:
                update_stage(db_id, 'rejected')
            print(f"[Agent] Safety net saved: R={r_score} G={g_score} C={c_score} Final={final}")
        except Exception as e:
            print(f"[Agent] Safety net parse failed: {e}")

    return final_output