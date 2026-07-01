import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import JobDescription from './pages/JobDescription';
import CandidatesBoard from './pages/CandidatesBoard';
import CandidateInterview from './pages/CandidateInterview';
import InterviewSettings from './pages/InterviewSettings';

function MainLayout() {
  const location = useLocation();
  const isCandidatePage = location.pathname.startsWith('/interview/');

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ background: 'var(--sp-black)', color: 'var(--sp-text)' }}
    >
      {!isCandidatePage && <Sidebar />}
      <main className="flex-1 overflow-x-hidden overflow-y-auto animated-bg">
        <Routes>
          <Route path="/"                       element={<Dashboard />} />
          <Route path="/jd"                     element={<JobDescription />} />
          <Route path="/candidates"             element={<CandidatesBoard />} />
          <Route path="/interview-settings"     element={<InterviewSettings />} />
          <Route path="/interview/:candidateId" element={<CandidateInterview />} />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  return (
    <Router>
      <MainLayout />
    </Router>
  );
}

export default App;
