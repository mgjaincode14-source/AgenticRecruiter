# tools/resumeScan.py
"""
Extracts text from a candidate's resume PDF.

Source of the PDF can be:
  1. NEW FORM  — candidate uploaded a PDF via Google Forms.
                 Google auto-generates a Drive URL: https://drive.google.com/open?id=...
  2. OLD FORM  — candidate manually pasted a Drive share link:
                 https://drive.google.com/file/d/.../view  OR
                 https://drive.google.com/uc?export=download&id=...

Both are handled identically — the URL is converted to a direct
download link, the PDF is downloaded, and text is extracted.

Extraction strategy (same for both sources):
  Step 1 — Try pypdf  (fast; works on digital / text-based PDFs)
  Step 2 — If pypdf returns empty, fall back to Tesseract OCR
            (works on scanned PDFs and image-based resumes)
"""

import re
import os
import tempfile
import requests
import pytesseract
import fitz
import io
from PIL             import Image
from pypdf           import PdfReader
from langchain.tools import tool

# ── Point pytesseract to Tesseract install path ────────
# Change this path if your Tesseract installed elsewhere
pytesseract.pytesseract.tesseract_cmd = (
    r"C:\Program Files\Tesseract-OCR\tesseract.exe"
)


# ══════════════════════════════════════════════════════
# HELPER — Convert any Google Drive URL to a direct
#          download link.
#
# Handles all three formats produced by Drive / Forms:
#   1. https://drive.google.com/file/d/FILE_ID/view
#   2. https://drive.google.com/open?id=FILE_ID        ← new from Google Forms upload
#   3. https://drive.google.com/uc?export=download&id=FILE_ID
# ══════════════════════════════════════════════════════
def _to_direct_link(url: str) -> str:
    # Format 1: /file/d/FILE_ID/...
    match = re.search(r"/file/d/([a-zA-Z0-9_-]+)", url)
    if match:
      return f"https://drive.google.com/uc?export=download&id={match.group(1)}"

    # Format 2 & 3: ?id=FILE_ID  or  &id=FILE_ID  or  open?id=FILE_ID
    match = re.search(r"[?&]id=([a-zA-Z0-9_-]+)", url)
    if match:
      return f"https://drive.google.com/uc?export=download&id={match.group(1)}"

    # Unknown format — return as-is and let requests try
    return url


# ══════════════════════════════════════════════════════
# HELPER — Extract text using pypdf (text-based PDFs)
# ══════════════════════════════════════════════════════
def _extract_with_pypdf(pdf_path: str) -> str:
    """
    Tries to extract text directly from PDF using pypdf.
    Works on text-based PDFs (digital, not scanned).
    Returns empty string if PDF is image-based.
    """
    try:
        reader = PdfReader(pdf_path)
        text   = "\n".join(
            page.extract_text() or ""
            for page in reader.pages
        ).strip()
        return text
    except Exception as e:
        print(f"[ResumeTool] pypdf failed: {e}")
        return ""


# ══════════════════════════════════════════════════════
# HELPER — Extract text using OCR (image-based / scanned PDFs)
# ══════════════════════════════════════════════════════
def _extract_with_ocr(pdf_path: str) -> str:
    """
    Converts each PDF page to an image and runs
    Tesseract OCR on it. Used when pypdf returns empty.
    Works on scanned resumes and image PDFs.
    """
    try:
        print("[ResumeTool] pypdf returned empty — switching to OCR using PyMuPDF...")

        doc = fitz.open(pdf_path)
        all_text = ""
        
        for i, page in enumerate(doc):
            print(f"[ResumeTool] OCR processing page {i + 1}/{len(doc)}...")
            
            # Render page to a pixmap (image) at 300 DPI (which is a zoom factor of 300/72 = 4.167)
            zoom = 300 / 72
            matrix = fitz.Matrix(zoom, zoom)
            pix = page.get_pixmap(matrix=matrix)
            
            # Convert pixmap bytes to PIL Image
            img_data = pix.tobytes("png")
            page_image = Image.open(io.BytesIO(img_data))
            
            # Run Tesseract on each page image
            page_text = pytesseract.image_to_string(
                page_image,
                lang   = "eng",
                config = "--psm 6",
            )
            all_text += f"\n--- Page {i + 1} ---\n{page_text}"
            
        doc.close()
        return all_text.strip()

    except Exception as e:
        print(f"[ResumeTool] OCR failed: {e}")
        return ""


# ══════════════════════════════════════════════════════
# MAIN TOOL
# ══════════════════════════════════════════════════════
@tool
def scan_resume(resume_url: str, job_description: str) -> str:
    """
    Downloads a candidate's resume PDF from Google Drive and extracts all text.

    The resume_url may be:
      - A Google Forms file-upload URL: https://drive.google.com/open?id=...
      - A manually shared Drive link:   https://drive.google.com/file/d/.../view
      - A direct download link:         https://drive.google.com/uc?export=download&id=...

    All formats are normalised to a direct download link automatically.

    Extraction strategy:
      1. Try pypdf first  — fast, works on digital/text PDFs
      2. If pypdf returns empty, fall back to Tesseract OCR
         — works on scanned resumes and image-based PDFs

    Returns extracted resume text + job description for the LLM to score.
    """
    if not resume_url or resume_url.strip() == "":
        return "No resume URL provided."

    tmp_path = None
    try:
        direct_url = _to_direct_link(resume_url)

        # ── Step 1: Download PDF ───────────────────────
        print(f"[ResumeTool] Downloading resume from Drive...")
        print(f"[ResumeTool] Resolved URL: {direct_url}")

        response = requests.get(
            direct_url,
            headers         = {"User-Agent": "Mozilla/5.0"},
            timeout         = 30,
            allow_redirects = True,
        )

        if response.status_code != 200:
            return (
                f"Could not download resume. "
                f"Status: {response.status_code}. "
                f"Ensure the Google Drive file is accessible "
                f"('Anyone with link can view')."
            )

        # Check if Google returned an HTML page instead of a PDF
        # (happens when the file is private or requires sign-in)
        content_start = response.content[:200]
        if b"<!DOCTYPE html>" in content_start or b"<html" in content_start:
            return (
                "Google Drive returned a login/error page instead of the PDF. "
                "The resume file is private or requires Google sign-in. "
                "Ensure the file sharing is set to 'Anyone with link can view'."
            )

        # ── Step 2: Save to temp file ──────────────────
        tmp      = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
        tmp.write(response.content)
        tmp.close()
        tmp_path = tmp.name
        print(f"[ResumeTool] PDF saved to temp file ({len(response.content)} bytes)")

        # ── Step 3: Try pypdf first (text-based PDF) ──
        text = _extract_with_pypdf(tmp_path)

        if text:
            print(f"[ResumeTool] pypdf extracted {len(text)} characters.")
            method = "pypdf (text-based PDF)"

        else:
            # ── Step 4: Fall back to Tesseract OCR ────
            # This handles scanned resumes and image-only PDFs
            print("[ResumeTool] No text from pypdf — trying Tesseract OCR...")
            text   = _extract_with_ocr(tmp_path)
            method = "Tesseract OCR (scanned/image-based PDF)"

            if not text:
                return (
                    "Resume downloaded but text extraction failed. "
                    "Both pypdf and Tesseract OCR returned empty. "
                    "The PDF may be corrupted, password-protected, or unsupported."
                )

        print(f"[ResumeTool] Extraction complete via {method}.")

        # ── Step 5: Validate that extracted text is meaningful ──
        # Reject junk/placeholder content (e.g. "xxxxxxxx", very short, or all symbols)
        cleaned = text.strip()
        # Count real alphabetic words (3+ chars)
        real_words = [w for w in cleaned.split() if sum(c.isalpha() for c in w) >= 3]
        # Flag if text is dominated by repeated characters or symbols
        unique_chars = set(cleaned.lower().replace(' ', '').replace('\n', ''))
        is_repetitive = len(unique_chars) <= 4 and len(cleaned) > 10

        if len(real_words) < 20 or is_repetitive:
            return (
                "RESUME CONTENT INVALID — The resume does not contain any recognizable or meaningful text. "
                "The document appears to be blank, contain placeholder text (e.g. 'xxxxxxx'), "
                "or only random characters. This candidate should receive a resume_score of 0 "
                "with reasoning: 'The resume contains no real content or is filled with placeholder text.'"
            )

        return (
            f"EXTRACTION METHOD: {method}\n"
            f"{'='*50}\n"
            f"RESUME:\n{text}\n\n"
            f"{'='*50}\n"
            f"JOB DESCRIPTION:\n{job_description}"
        )

    except Exception as e:
        return f"Resume scan failed: {e}"

    finally:
        # Always clean up temp file regardless of outcome
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)
            print("[ResumeTool] Temp file deleted.")