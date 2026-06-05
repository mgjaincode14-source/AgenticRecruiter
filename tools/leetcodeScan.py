# tools/coding_tool.py
import requests
from langchain.tools import tool

LEETCODE_URL   = "https://leetcode.com/graphql"

# GraphQL is a query language for APIs.
# This is the standard way to request data from LeetCode.
# There is no other format — this is not hardcoding a business rule,
# it is simply the API's required request format.
LEETCODE_QUERY = """
query ($username: String!) {
    matchedUser(username: $username) {
        submitStats: submitStatsGlobal {
            acSubmissionNum {
                difficulty
                count
            }
        }
        languageProblemCount {
            languageName
            problemsSolved
        }
        profile {
            ranking
        }
        badges {
            name
        }
    }
}
"""


@tool
def scan_coding_profile(leetcode_username: str, job_description: str) -> str:
    """
    Fetches LeetCode profile: problems solved by difficulty,
    languages used, ranking, and badges.
    The LLM agent reads this and decides the score.
    No scoring logic here — agent decides everything.
    """
    if not leetcode_username:
        return "No LeetCode username provided. Coding score should be 0."

    username = leetcode_username.strip()

    try:
        response = requests.post(
            LEETCODE_URL,
            json={"query": LEETCODE_QUERY, "variables": {"username": username}},
            # Mozilla/5.0 required — LeetCode blocks non-browser requests
            headers={
                "Content-Type": "application/json",
                "User-Agent":   "Mozilla/5.0",
                "Referer":      "https://leetcode.com"
            },
            timeout=15
        )

        if response.status_code != 200:
            return f"LeetCode API error: {response.status_code}. Score should be 0."

        user = response.json().get("data", {}).get("matchedUser")

        if not user:
            return f"LeetCode user '{username}' not found. Score should be 0."

        # Parse solved counts
        solved  = {
            e["difficulty"].lower(): e["count"]
            for e in user.get("submitStats", {}).get("acSubmissionNum", [])
        }

        # Parse languages
        langs   = ", ".join(
            f"{l['languageName']}({l['problemsSolved']})"
            for l in sorted(
                user.get("languageProblemCount", []),
                key=lambda x: x["problemsSolved"],
                reverse=True
            )[:5]
        ) or "None"

        badges  = ", ".join(b["name"] for b in user.get("badges", [])) or "None"
        ranking = user.get("profile", {}).get("ranking", "Unranked")

        return (
            f"LEETCODE: {username}\n"
            f"{'='*50}\n"
            f"Total Solved : {solved.get('all', 0)}\n"
            f"Easy         : {solved.get('easy', 0)}\n"
            f"Medium       : {solved.get('medium', 0)}\n"
            f"Hard         : {solved.get('hard', 0)}\n"
            f"Ranking      : {ranking}\n"
            f"Badges       : {badges}\n"
            f"Languages    : {langs}\n"
            f"{'='*50}\n"
            f"JOB DESCRIPTION:\n{job_description}"
        )

    except Exception as e:
        return f"LeetCode scan failed: {e}. Score should be 0."