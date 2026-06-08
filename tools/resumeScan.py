import re
import requests
import tempfile
import os
from langchain.tools import tool
from pypdf import PdfReader


def _to_direct_link(url: str) -> str:
    match = re.search(r"/file/d/([a-zA-Z0-9_-]+)", url)
    if match:
        return f"https://drive.google.com/uc?export=download&id={match.group(1)}"
    match = re.search(r"[?&]id=([a-zA-Z0-9_-]+)", url)
    if match:
        return f"https://drive.google.com/uc?export=download&id={match.group(1)}"
    return url


@tool
def scan_resume(resume_url: str, job_description: str) -> str:
    """
    Downloads resume PDF, extracts all text from it,
    and returns the text alongside the job description.
    The LLM agent reads this and decides the score.
    """
    if not resume_url:
        return "No resume URL provided."

    tmp_path = None
    try:
        response = requests.get(
            _to_direct_link(resume_url),
            headers={"User-Agent": "Mozilla/5.0"},
            timeout=20,
            allow_redirects=True
        )

        if response.status_code != 200:
            return (
                f"Could not download resume. Status: {response.status_code}. "
                f"Ensure the Google Drive link is set to 'Anyone with link can view'."
            )

        # Save to temp file — pypdf requires a file on disk
        tmp      = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
        tmp.write(response.content)
        tmp.close()
        tmp_path = tmp.name

        # Extract text from every page
        reader = PdfReader(tmp_path)
        text   = "\n".join(
            page.extract_text() or ""
            for page in reader.pages
        ).strip()

        if not text:
            return "Resume downloaded but no text found. May be a scanned image PDF."

        return f"RESUME:\n{text}\n\nJOB DESCRIPTION:\n{job_description}"

    except Exception as e:
        return f"Resume scan failed: {e}"

    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)