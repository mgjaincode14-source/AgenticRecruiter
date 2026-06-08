from langchain.tools import tool
from databaseConnect import update_scores, update_stage

@tool
def compute_and_save_score(
    db_id:             int,
    resume_score:      int,
    github_score:      int,
    coding_score:      int,
    resume_reasoning:  str,
    github_reasoning:  str,
    coding_reasoning:  str,
) -> str:
    """
    Takes all three scores and reasoning from the LLM agent,
    computes the weighted final score, saves everything to
    Supabase, and returns the decision — SHORTLISTED or REJECTED.

    The LLM agent must call this after all three scan tools
    have finished and it has assigned scores.

    Scoring formula:
        final = (0.5 x resume) + (0.4 x github) + (0.1 x coding)

    Decision:
        final >= 6  →  SHORTLISTED
        final <  6  →  REJECTED
    """

    resume_score = max(0, min(10, int(resume_score)))
    github_score = max(0, min(10, int(github_score)))
    coding_score = max(0, min(10, int(coding_score)))

    final_score  = round(
        (0.5 * resume_score) +
        (0.4 * github_score) +
        (0.1 * coding_score)
    )

    update_scores(
        db_id      = db_id,
        candidate  = {
            "resume_score":     resume_score,
            "github_score":     github_score,
            "coding_score":     coding_score,
            "final_score":      final_score,
            "resume_reasoning": resume_reasoning,
            "github_reasoning": github_reasoning,
            "coding_reasoning": coding_reasoning,
        }
    )

    if final_score >= 6:
        update_stage(db_id, "shortlisted")
        return (
            f"DECISION: SHORTLISTED\n"
            f"Final Score : {final_score}/10\n"
            f"Resume      : {resume_score}/10 — {resume_reasoning}\n"
            f"GitHub      : {github_score}/10 — {github_reasoning}\n"
            f"Coding      : {coding_score}/10 — {coding_reasoning}\n"
            f"Next step   : Call send_assessment_email tool."
        )
    else:
        update_stage(
            db_id,
            "rejected",
            reason = (
                f"Final score {final_score}/10 below threshold of 6. "
                f"Resume: {resume_score}, "
                f"GitHub: {github_score}, "
                f"Coding: {coding_score}."
            )
        )
        return (
            f"DECISION: REJECTED\n"
            f"Final Score : {final_score}/10\n"
            f"Resume      : {resume_score}/10 — {resume_reasoning}\n"
            f"GitHub      : {github_score}/10 — {github_reasoning}\n"
            f"Coding      : {coding_score}/10 — {coding_reasoning}\n"
            f"Reason      : Score below threshold. No email to be sent."
        )