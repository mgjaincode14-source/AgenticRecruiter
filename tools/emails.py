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

    sender   = os.getenv("EMAIL_SENDER")
    password = os.getenv("EMAIL_APP_PASSWORD")

    if not sender or not password:
        return (
            "ERROR: EMAIL_SENDER or EMAIL_APP_PASSWORD "
            "missing in .env file. Email not sent."
        )

    subject = "Invitation for Assessment Round"

    body = f"""Dear {candidate_name},

Congratulations! After reviewing your resume, we are pleased to inform you
that you have been shortlisted for the next stage of our recruitment process.

You are invited to appear for our Online Assessment Round.

Assessment Details:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Date     : To be communicated shortly
Duration : 60 minutes
Format   : Online (link will be shared separately)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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