import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from langchain.tools import tool
from dotenv import load_dotenv
from databaseConnect import mark_email_sent, update_stage

load_dotenv()


@tool
def send_assessment_email(
    db_id:           int,
    candidate_name:  str,
    candidate_email: str,
) -> str:
    """
    Sends a coding round assessment invitation email
    to a shortlisted candidate using Gmail SMTP.
    Updates Supabase: email_sent = True, stage = assessment_sent.
    Call this only after compute_and_save_score returns SHORTLISTED.
    """

    try:
        from databaseConnect import get_candidate_by_id
        candidate = get_candidate_by_id(db_id)
        if candidate and candidate.get("email_sent"):
            print(f"[EmailTool] Email already sent to {candidate_name} ({candidate_email}). Skipping.")
            return f"SUCCESS: Assessment invitation was already sent to {candidate_name} ({candidate_email})."
    except Exception as e:
        print(f"[EmailTool] Error checking duplicate email: {e}")

    sender   = os.getenv("EMAIL_SENDER")
    password = os.getenv("EMAIL_APP_PASSWORD")

    if not sender or not password:
        return (
            "ERROR: EMAIL_SENDER or EMAIL_APP_PASSWORD "
            "missing in .env file. Email not sent."
        )

    subject = "Invitation for AI Screening Interview - AgenticATS"

    interview_link = f"http://localhost:5173/interview/{db_id}"

    body = f"""Dear {candidate_name},

Congratulations! After reviewing your resume and profiles, we are pleased to inform you
that you have been shortlisted for the next stage of our recruitment process.

You are invited to appear for our Online AI Screening Interview.

Interview Details:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Round    : Virtual AI Screening
Duration : ~10-15 minutes (2 minutes limit per question)
Format   : Online (Camera and Microphone required ON)
Link     : {interview_link}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Please ensure you are in a quiet room with a stable internet connection. You must answer each question verbally; your responses will be recorded and transcribed by our AI Hiring Agent for evaluation.

Best regards,
HR & Team"""

    msg            = MIMEMultipart()
    msg["From"]    = sender
    msg["To"]      = candidate_email
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "plain"))

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(sender, password)
            server.sendmail(sender, candidate_email, msg.as_string())

        mark_email_sent(db_id)
        update_stage(db_id, "assessment_sent")

        print(f"[EmailTool] Mail sent to {candidate_name} at {candidate_email}")
        return (
            f"SUCCESS: Assessment invitation sent to "
            f"{candidate_name} ({candidate_email}). "
            f"Supabase updated: stage=assessment_sent, email_sent=True."
        )

    except smtplib.SMTPAuthenticationError:
        return (
            "ERROR: Gmail authentication failed. "
            "Check EMAIL_SENDER and EMAIL_APP_PASSWORD in .env. "
            "Make sure you are using an App Password, not your Gmail password."
        )

    except smtplib.SMTPException as e:
        return f"ERROR: Failed to send email via SMTP: {e}"

    except Exception as e:
        return f"ERROR: Unexpected error sending email: {e}"