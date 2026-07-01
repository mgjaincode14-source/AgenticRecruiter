import os
import json
from groq import Groq
from langchain_groq import ChatGroq

# ─────────────────────────────────────────────
# STEP 1: Transcribe with Groq Whisper
# ─────────────────────────────────────────────
def transcribe_audio_with_groq(file_path: str) -> str:
    """
    Transcribes an audio file using Groq's Whisper Large v3 model.
    Returns the raw spoken text.
    """
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        print("[Transcription] Error: GROQ_API_KEY is not set.")
        return ""

    if not os.path.exists(file_path):
        print(f"[Transcription] Error: Audio file not found at {file_path}")
        return ""

    file_size = os.path.getsize(file_path)
    if file_size < 100:
        print(f"[Transcription] Error: Audio file is too small ({file_size} bytes). Skipping.")
        return ""

    try:
        client = Groq(api_key=api_key)
        with open(file_path, "rb") as audio_file:
            response = client.audio.transcriptions.create(
                file=(os.path.basename(file_path), audio_file.read()),
                model="whisper-large-v3",
                response_format="text",
                language="en",
                prompt="Please listen very carefully and hear clearly to accurately transcribe the candidate's exact words. The speaker is a software engineer being interviewed. They may mention technical terms such as FastAPI, NoSQL, PostgreSQL, MongoDB, GitHub, Node.js, Express.js, React, TypeScript, JavaScript, Docker, Kubernetes, AWS, S3, EC2, REST API, GraphQL, SQL, Redis, LangChain."
            )
            transcript = str(response).strip()
            print(f"[Transcription] Whisper raw output ({len(transcript)} chars): {transcript[:120]}...")
            return transcript
    except Exception as e:
        print(f"[Transcription] Error calling Groq Whisper API: {e}")
        return ""


# ─────────────────────────────────────────────
# STEP 2: Correct technical jargon with LLM
# ─────────────────────────────────────────────
def correct_technical_terms(raw_transcript: str) -> str:
    """
    Passes the Whisper raw transcript through Llama-3.3 to correct any
    technical terms that were phonetically misheard.
    Returns the corrected text string.
    """
    if not raw_transcript or not raw_transcript.strip():
        return raw_transcript

    llm = ChatGroq(
        model="llama-3.3-70b-versatile",
        temperature=0,
    ).with_fallbacks([
        ChatGroq(model="llama-3.1-8b-instant", temperature=0)
    ])

    prompt = f"""You are a technical transcript corrector for software engineering job interviews. The text below is a speech-to-text transcription where the speaker is a software engineer answering interview questions. The speech recognition system may have phonetically misheard technical terms, programming languages, frameworks, tools, cloud services, or proper nouns common in software engineering.

Your task:
1. Identify any words or phrases that appear to be phonetic mispronunciations or misspellings of well-known technical terms used in software engineering.
2. Correct ONLY those misheard technical terms to their proper form.
3. Do NOT rephrase, summarize, rewrite, or alter the meaning of the candidate's answer in any way.
4. Preserve the candidate's exact sentence structure, grammar, and speaking style.
5. If no correction is needed, return the text exactly as given.

RAW TRANSCRIPT:
{raw_transcript}

Return ONLY the corrected text. No explanations, no labels, no quotes."""

    try:
        response = llm.invoke(prompt)
        corrected = response.content.strip()
        print(f"[Transcription] LLM corrected ({len(corrected)} chars): {corrected[:120]}...")
        return corrected
    except Exception as e:
        print(f"[Transcription] LLM correction failed: {e}. Returning Whisper raw output.")
        return raw_transcript


def segment_transcript_to_qa(full_transcript: str, questions: list[str], browser_transcript: list[dict] = None) -> list[dict]:
    """
    Uses Llama-3.3-70b-versatile to align the high-accuracy full_transcript from Whisper
    to the structured list of questions, using the browser-transcribed Q&A as an alignment reference.
    Ensures key order of {"question": ..., "answer": ...} is preserved.
    """
    if not full_transcript:
        print("[Transcription] Whisper transcript is empty. Falling back to browser draft.")
        return browser_transcript or []
        
    llm = ChatGroq(
        model="llama-3.3-70b-versatile",
        temperature=0,  # Deterministic mapping
    ).with_fallbacks([
        ChatGroq(model="llama-3.1-8b-instant", temperature=0)
    ])
    
    # Format the input for the LLM
    questions_formatted = "\n".join([f"{idx+1}. {q}" for idx, q in enumerate(questions)])
    
    browser_formatted = ""
    if browser_transcript:
        for idx, item in enumerate(browser_transcript):
            browser_formatted += f"Question {idx+1}: {item.get('question', '')}\n"
            browser_formatted += f"Browser Draft Answer: {item.get('answer', '')}\n\n"
            
    prompt = f"""
You are an expert recruitment assistant. You are given a list of interview questions, a continuous high-accuracy transcription of the candidate's spoken answers (transcribed by Whisper), and a draft transcript recorded by the browser (which has correct question-to-answer alignment but may have minor phonetic spelling/mishearing errors).

Your task is to produce a structured JSON array representing the corrected answers for each question. 

Here is the data:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INTERVIEW QUESTIONS:
{questions_formatted}

HIGH-ACCURACY CONTINUOUS WHISPER TRANSCRIPT:
{full_transcript}

BROWSER DRAFT TRANSCRIPT FOR ALIGNMENT REFERENCE:
{browser_formatted}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Instructions:
1. For each question in the list, extract the corresponding candidate's answer.
2. Use the "BROWSER DRAFT TRANSCRIPT" to understand which parts of the candidate's response belong to which question.
3. Use the "HIGH-ACCURACY CONTINUOUS WHISPER TRANSCRIPT" to correct any misspelled words, technical terms (e.g. "FastAPI", "SQL", "NoSQL", "Docker", "S3", etc.), or transcription errors in the draft.
4. If a question was skipped or not answered, return "[No spoken answer recorded]" for that answer.
5. Your response must be a JSON array of objects. 
6. Each object in the JSON array must contain exactly two keys: "question" and "answer" (in that exact order).

Output format:
[
  {{
    "question": "question text",
    "answer": "candidate's corrected answer"
  }},
  ...
]

Do not include any introductory or concluding text. Do not wrap in markdown code blocks. Return valid JSON only.
"""
    try:
        response = llm.invoke(prompt)
        response_text = response.content.strip()
        
        # Clean up potential markdown code block wraps
        if response_text.startswith("```json"):
            response_text = response_text.replace("```json", "", 1)
        if response_text.endswith("```"):
            response_text = response_text[:-3].strip()
        response_text = response_text.strip()
        
        parsed = json.loads(response_text)
        if isinstance(parsed, list):
            # Ensure the key order of {"question": ..., "answer": ...} is preserved
            ordered_parsed = []
            for item in parsed:
                if isinstance(item, dict):
                    ordered_item = {}
                    if "question" in item:
                        ordered_item["question"] = item["question"]
                    if "answer" in item:
                        ordered_item["answer"] = item["answer"]
                    ordered_parsed.append(ordered_item)
            return ordered_parsed
        return browser_transcript or []
    except Exception as e:
        print(f"[Transcription] Error segmenting transcript: {e}")
        return browser_transcript or []
