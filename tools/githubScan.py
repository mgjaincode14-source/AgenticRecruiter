import os
import re
import base64
import requests
from langchain.tools import tool
from dotenv import load_dotenv

load_dotenv()

GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "")


def _headers() -> dict:
    h = {"Accept": "application/vnd.github.v3+json"}
    if GITHUB_TOKEN:
        h["Authorization"] = f"token {GITHUB_TOKEN}"
    return h


def _username_from_url(url: str) -> str:
    match = re.search(r"github\.com/([a-zA-Z0-9_-]+)", url)
    if match:
        return match.group(1)
    if "/" not in url and "." not in url:
        return url.strip()
    return ""


@tool
def scan_github(github_url: str, job_description: str) -> str:
    """
    Fetches all public GitHub repositories for a candidate.
    For each repo returns: name, language, description, topics.
    Also fetches README content for every repo.
    The LLM agent reads all of this and decides the score.
    """
    if not github_url:
        return "No GitHub URL provided. GitHub score should be 0."

    username = _username_from_url(github_url)
    if not username:
        return f"Could not extract username from: {github_url}"

    # Fetch all public repos sorted by most recently updated
    response = requests.get(
        f"https://api.github.com/users/{username}/repos",
        headers=_headers(),
        params={"sort": "updated", "per_page": 10, "type": "public"},
        timeout=10
    )

    if response.status_code == 404:
        return f"GitHub user @{username} not found. Score should be 0."
    if response.status_code == 403:
        return "GitHub API rate limit hit. Add GITHUB_TOKEN to .env"
    if response.status_code != 200:
        return f"GitHub API error: {response.status_code}"

    repos = response.json()
    if not repos:
        return f"@{username} has no public repositories. Score should be 0."

    # Build repo summaries — LLM decides what is relevant
    summary = f"GITHUB: @{username} | {len(repos)} public repos\n{'='*50}\n"

    for repo in repos:
        name     = repo.get("name", "")
        language = repo.get("language") or "Unknown"
        desc     = repo.get("description") or "No description"
        topics   = ", ".join(repo.get("topics", [])) or "none"

        # Fetch README for every repo — LLM reads all of it
        readme   = ""
        readme_r = requests.get(
            f"https://api.github.com/repos/{username}/{name}/readme",
            headers=_headers(),
            timeout=10
        )
        if readme_r.status_code == 200:
            try:
                readme = base64.b64decode(
                    readme_r.json()["content"]
                ).decode("utf-8", errors="ignore")[:800]
            except Exception:
                readme = "Could not decode README."
        else:
            readme = "No README."

        summary += (
            f"\nRepo      : {name}\n"
            f"Language  : {language}\n"
            f"Description: {desc}\n"
            f"Topics    : {topics}\n"
            f"README    :\n{readme}\n"
            f"{'─'*40}\n"
        )

    summary += f"\nJOB DESCRIPTION:\n{job_description}"
    return summary