# AI Agentic Hiring System

This project is an end-to-end autonomous AI hiring pipeline. It automatically syncs applicant data from a Google Form, evaluates their Resume, GitHub, and LeetCode profiles using autonomous AI Agents powered by Groq and LangGraph, scores the candidates dynamically against a provided Job Description, and acts on the results by either updating the Supabase database or sending automated assessment emails.

## 🚀 Features

- **Automated Data Sync**: Pulls candidate details securely via Google Service Accounts.
- **Multi-Agent Evaluation**: Parses Resumes, scans GitHub repositories for relevant skills, and queries LeetCode problem-solving stats.
- **Intelligent Scoring**: LangGraph-powered reasoning assigns a score based strictly on the alignment with the `jobDescription.txt`.
- **Dynamic Fallbacks**: Automatically handles rate limits by falling back from 70B models to smaller, fast 8B models, complete with dynamic safety nets for error handling.
- **Interactive Dashboard**: A modern React frontend for HR personnel to view pending candidates, trigger evaluations, and visualize shortlisted vs. rejected candidates.

## 🛠️ Prerequisites & Requirements

- **Operating System**: Windows / macOS / Linux
- **Python**: Version `3.10` or higher
- **Node.js**: Version `18.x` or higher (for the frontend dashboard)
- **Supabase**: A Supabase project set up with a `candidates` table.

## ⚙️ Setup Instructions

### 1. Backend (Python API & Agents)

1. **Open the Terminal** and navigate to the project root.
2. **Set up a Virtual Environment**:
   ```powershell
   python -m venv venv
   .\venv\Scripts\activate
   ```
3. **Install Dependencies**:
   ```powershell
   pip install -r requirements.txt
   ```
   *(Note: Ensure you have LangGraph, LangChain, FastAPI, Uvicorn, and Supabase packages installed. If `requirements.txt` is missing, manually install them.)*
4. **Environment Variables**: 
   Create a `.env` file in the project root folder. You can use the provided `.env.example` as a template.
   Fill in your actual API keys:
   - `GROQ_API_KEY`: Get this from your Groq console.
   - `SUPABASE_URL` and `SUPABASE_KEY`: Get these from your Supabase project settings.
   - `EMAIL_SENDER` and `EMAIL_APP_PASSWORD`: Generate an app password from your Google account.
   - `GITHUB_TOKEN`: Generate a personal access token from GitHub to avoid rate limits.
5. **Google Credentials**:
   Place your `credentials.json` for the Google Service Account in the root directory. This is required for syncing Google Form responses.
6. **Job Description**:
   Ensure `jobDescription.txt` is populated with the target role's requirements. This file is the source of truth for the Agent's scoring logic.

### 2. Frontend (React Dashboard)

1. Open a **new Terminal window** and navigate to the frontend folder:
   ```powershell
   cd frontend
   ```
2. **Install Node Packages**:
   ```powershell
   npm install
   ```

## 💻 Running the Application

To operate the full system, you need to run both the backend server and the frontend dashboard simultaneously.

**Terminal 1 (Backend)**:
```powershell
.\venv\Scripts\activate
python server.py
```
*The backend API will run on `http://localhost:8000`.*

**Terminal 2 (Frontend)**:
```powershell
cd frontend
npm run dev
```
*The dashboard will run on `http://localhost:5173`.*

## 📋 How to Operate (For HR)

1. Open the dashboard URL in your browser.
2. Ensure you have the latest responses by clicking the **Sync** button. This pulls new applications from Google Forms directly into your pending column.
3. Review the pending candidates. Click **Evaluate** on any candidate.
4. The system will take roughly 30 to 60 seconds to process the candidate's profiles. It evaluates their Resume, GitHub, and LeetCode. 
5. Once complete, the board will automatically refresh and move the candidate to either the **Shortlisted** or **Rejected** column based on their performance score.
6. Check the candidate's card for the AI's detailed reasoning on *why* the score was assigned. Shortlisted candidates automatically receive an email invitation to the next phase.

## 🛑 Troubleshooting

- **Rate Limit Hits (429 Errors)**: The backend automatically falls back to secondary models if Groq's rate limits are hit. No manual intervention is needed.
- **Evaluation Stuck/Failing**: Ensure all your tokens in `.env` are valid and the `jobDescription.txt` file is not empty.
