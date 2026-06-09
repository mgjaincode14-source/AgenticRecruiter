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
# LLM
# ══════════════════════════════════════════════════════
llm = ChatGroq(
    model       = "llama-3.3-70b-versatile",
    temperature = 0,      # 0 = consistent, deterministic decisions
)


# ══════════════════════════════════════════════════════
# TOOLS
# All 5 tools registered — LLM sees all of them
# and decides which to call and when
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
# This is the LLM's instruction manual.
# It tells the agent exactly what its job is,
# what tools it has, and what decisions to make.
# ══════════════════════════════════════════════════════
SYSTEM_PROMPT = """
You are an autonomous AI hiring agent for a tech company.

You will receive one candidate's complete details.
Your job is to evaluate them end-to-end using your tools
and make a final hiring decision.

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
  0–3  : No match / missing / very weak
  4–6  : Partial match / some relevant content
  7–8  : Good match / solid evidence
  9–10 : Excellent match / outstanding evidence

For resume_score:
  - Does the candidate's experience match the JD requirements?
  - Are the required skills present?
  - Is there evidence of real projects?

For github_score:
  - Are there real, non-tutorial projects?
  - Does the tech stack match the JD?
  - Are READMEs detailed? Are there meaningful commits?
  - Empty repos or only tutorial forks = score 1-2

For coding_score:
  - Total problems solved matters most
  - Medium + Hard count shows depth
  - 0 problems = score 0
  - 300+ with good hard ratio = score 9-10

Write one sentence of reasoning for each score.
Be strict. Do not inflate scores.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 3 — SAVE SCORES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Call compute_and_save_score with:
  - db_id
  - all three scores
  - one sentence reasoning for each

The tool computes:
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
End with a clean summary:

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
# AGENT + EXECUTOR
# ══════════════════════════════════════════════════════
hiring_executor = create_react_agent(
    model=llm,
    tools=TOOLS,
    prompt=SYSTEM_PROMPT
)


# ══════════════════════════════════════════════════════
# MAIN FUNCTION — called by main.py for each candidate
# ══════════════════════════════════════════════════════
def run_hiring_agent(candidate: dict, job_description: str) -> str:
    """
    Runs the full agentic hiring pipeline for one candidate.
    The LLM decides everything from this point forward.

    Args:
        candidate       : dict from Supabase (one row)
        job_description : string read from jobdescription.txt

    Returns:
        Final decision string from the agent.
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

    result = hiring_executor.invoke({"messages": [("user", input_text)]})
    return result["messages"][-1].content