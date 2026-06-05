from pydantic import BaseModel
from typing import Optional

class Candidate(BaseModel):
    name: str = ""
    email: str = ""
    github_username: str = ""
    resume_url: str = ""

    resume_score: int = 0
    github_score: int = 0
    coding_score: int = 0
    final_score: int = 0

    resume_reasoning: str = ""
    github_reasoning: str = ""
    coding_reasoning: str = ""

    db_id: Optional[int] = None
    stage: str = "pending"
    rejection_reason: Optional[str] = None

    email_sent: bool = False
    offer_sent: bool = False