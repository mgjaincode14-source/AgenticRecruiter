import { useState, useEffect } from 'react';
import api from '../api';
import CandidateCard from '../components/CandidateCard';
import { RefreshCw, Play, Loader2, Users, Mic } from 'lucide-react';

const CandidatesBoard = () => {
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [evaluatingBulk, setEvaluatingBulk] = useState(false);

  const fetchCandidates = async () => {
    try {
      const res = await api.get('/candidates');
      setCandidates(res.data.candidates || []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCandidates(); }, []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await api.post('/sync');
      await fetchCandidates();
    } catch (error) {
      console.error(error);
    } finally {
      setSyncing(false);
    }
  };

  const handleBulkEvaluate = async () => {
    setEvaluatingBulk(true);
    try {
      await api.post('/evaluate-all');
      await fetchCandidates();
    } catch (error) {
      console.error(error);
    } finally {
      setEvaluatingBulk(false);
    }
  };

  const handleEvaluateSingle = async (id) => {
    try {
      await api.post(`/evaluate/${id}`);
      // Evaluation runs in background (30-60s). Auto-refresh after delay.
      setTimeout(async () => {
        await fetchCandidates();
      }, 45000);
      // Also do an immediate refresh to show any quick state change
      await fetchCandidates();
    } catch (error) {
      console.error(error);
    }
  };

  // ── Column filters ─────────────────────────────────────────────────────────
  const pending = candidates.filter(c => {
    const stage = (c.stage || 'pending').toLowerCase();
    const interviewStages = ['assessment_sent', 'email_sent', 'interview_completed', 'interview_passed', 'interview_failed', 'invited', 'shortlisted'];
    if (interviewStages.includes(stage) || stage === 'rejected') return false;
    return stage === 'pending' || !c.final_score;
  });

  const screening = candidates.filter(c => {
    const stage = (c.stage || '').toLowerCase();
    return ['invited', 'assessment_sent', 'email_sent', 'interview_completed', 'shortlisted'].includes(stage);
  });

  const shortlisted = candidates.filter(c => {
    if (c.interview_score >= 0) return c.interview_score >= 5;
    return (c.stage || '').toLowerCase() === 'interview_passed';
  });

  const rejected = candidates.filter(c => {
    const stage = (c.stage || '').toLowerCase();
    if (c.interview_score >= 0) return c.interview_score < 5;
    return stage === 'rejected' || stage === 'interview_failed' || (c.final_score > 0 && c.final_score < 6);
  });

  if (loading) {
    return (
      <div className="min-h-screen animated-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full border-2 border-[#1DB954]/30 border-t-[#1DB954] animate-spin" />
          <p className="text-[#1DB954] font-bold text-sm tracking-widest uppercase animate-pulse">
            Loading pipeline...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen animated-bg p-8 md:p-10 max-w-[100rem] mx-auto flex flex-col animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-10 gap-6 animate-slide-up">
        <div>
          <div className="flex items-center gap-3 mb-1">
            {/* Spotify-style logo mark */}
            <div className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #1DB954, #158a3e)' }}>
              <Users className="w-5 h-5 text-black" />
            </div>
            <h1 className="text-3xl font-black text-white tracking-tight">
              Candidate Pipeline
            </h1>
          </div>
          <p className="text-[#b3b3b3] text-sm ml-13 pl-13" style={{ paddingLeft: '52px' }}>
            AI-powered multi-stage recruitment board
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full glass-card text-sm font-bold text-[#b3b3b3] hover:text-white transition-colors hover:scale-105 active:scale-95"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin text-[#1DB954]' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync Google Forms'}
          </button>

          <button
            onClick={handleBulkEvaluate}
            disabled={evaluatingBulk || pending.length === 0}
            className="flex items-center gap-2 px-6 py-2.5 sp-btn text-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none"
          >
            {evaluatingBulk
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Play className="w-4 h-4 fill-black" />
            }
            Evaluate All ({pending.length})
          </button>
        </div>
      </div>

      {/* 4-column board */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 flex-1 min-h-0 animate-slide-up delay-75">
        <Column
          title="Pending AI Review"
          count={pending.length}
          accentColor="#f59e0b"
          dotColor="bg-amber-400"
        >
          {pending.map(c => (
            <CandidateCard key={c.id} candidate={c} onEvaluate={() => handleEvaluateSingle(c.id)} />
          ))}
        </Column>

        <Column
          title="AI Screening Round"
          count={screening.length}
          accentColor="#3b82f6"
          dotColor="bg-blue-500"
          icon={<Mic className="w-3.5 h-3.5" style={{ color: '#3b82f6' }} />}
        >
          {screening.map(c => (
            <CandidateCard key={c.id} candidate={c} />
          ))}
        </Column>

        <Column
          title="Shortlisted"
          count={shortlisted.length}
          accentColor="#1DB954"
          dotColor="bg-[#1DB954]"
        >
          {shortlisted.map(c => (
            <CandidateCard key={c.id} candidate={c} />
          ))}
        </Column>

        <Column
          title="Rejected"
          count={rejected.length}
          accentColor="#f43f5e"
          dotColor="bg-rose-500"
        >
          {rejected.map(c => (
            <CandidateCard key={c.id} candidate={c} />
          ))}
        </Column>
      </div>
    </div>
  );
};

const Column = ({ title, count, accentColor, dotColor, icon, children }) => (
  <div
    className="flex flex-col rounded-2xl overflow-hidden"
    style={{
      background: 'rgba(24,24,24,0.85)',
      border: `1px solid rgba(255,255,255,0.06)`,
      borderTop: `3px solid ${accentColor}`,
      boxShadow: `0 4px 24px rgba(0,0,0,0.5), 0 0 0 0 ${accentColor}20`,
    }}
  >
    {/* Column header */}
    <div
      className="px-5 py-4 flex justify-between items-center"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.25)' }}
    >
      <h2 className="font-bold text-white text-sm flex items-center gap-2 uppercase tracking-widest">
        {icon && icon}
        {!icon && <span className={`w-2 h-2 rounded-full ${dotColor} inline-block`} />}
        {title}
      </h2>
      <span
        className="text-xs font-black px-3 py-1 rounded-full"
        style={{ background: 'rgba(255,255,255,0.08)', color: accentColor, border: `1px solid ${accentColor}30` }}
      >
        {count}
      </span>
    </div>

    {/* Cards */}
    <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
      {children}
      {count === 0 && (
        <div
          className="h-32 flex flex-col items-center justify-center rounded-xl text-sm font-medium"
          style={{
            border: '2px dashed rgba(255,255,255,0.06)',
            background: 'rgba(255,255,255,0.02)',
            color: '#535353',
          }}
        >
          <span className="text-2xl mb-2">—</span>
          <span className="text-xs uppercase tracking-widest">Empty</span>
        </div>
      )}
    </div>
  </div>
);

export default CandidatesBoard;
