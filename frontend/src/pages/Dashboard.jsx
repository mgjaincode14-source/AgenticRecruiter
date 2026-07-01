import { useState, useEffect } from 'react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { Users, CheckCircle2, XCircle, Clock, Mic, TrendingUp } from 'lucide-react';
import api from '../api';

// Spotify-themed colour palette
const PIE_COLORS = ['#f59e0b', '#1DB954', '#f43f5e', '#3b82f6', '#06b6d4'];
const BAR_COLORS = { Resume: '#1DB954', GitHub: '#3b82f6', Coding: '#f59e0b', Interview: '#06b6d4' };

const SP = {
  surface:  '#181818',
  surface2: '#242424',
  border:   'rgba(255,255,255,0.07)',
  green:    '#1DB954',
  sub:      '#b3b3b3',
  muted:    '#535353',
};

const Dashboard = () => {
  const [stats, setStats] = useState({
    total: 0, pending: 0, shortlisted: 0, rejected: 0,
    interviewPending: 0, interviewDone: 0, interviewPassed: 0, interviewFailed: 0,
  });
  const [avgScores, setAvgScores] = useState([]);
  const [pieData,   setPieData]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);

  useEffect(() => { fetchCandidates(); }, []);

  const fetchCandidates = async () => {
    try {
      const res = await api.get('/candidates');
      const candidates = res.data.candidates || [];

      let pending = 0, shortlisted = 0, rejected = 0;
      let interviewPending = 0, interviewDone = 0, interviewPassed = 0, interviewFailed = 0;
      let totalResume = 0, totalGithub = 0, totalCoding = 0;
      let totalInterview = 0, interviewScoreCount = 0, evaluatedCount = 0;

      candidates.forEach(c => {
        const stage = (c.stage || 'pending').toLowerCase();
        if (stage === 'pending')                                       pending++;
        else if (stage === 'shortlisted')                              shortlisted++;
        else if (stage === 'assessment_sent' || stage === 'email_sent' || stage === 'invited') interviewPending++;
        else if (stage === 'interview_completed')                      interviewDone++;
        else if (stage === 'interview_passed')                         { interviewPassed++; shortlisted++; }
        else if (stage === 'interview_failed')                         { interviewFailed++; rejected++; }
        else if (stage === 'rejected')                                 rejected++;
        else if (c.final_score >= 6)                                   shortlisted++;
        else if (c.final_score > 0)                                    rejected++;
        else                                                           pending++;

        if (c.final_score > 0 || c.resume_score > 0) {
          totalResume  += c.resume_score  || 0;
          totalGithub  += c.github_score  || 0;
          totalCoding  += c.coding_score  || 0;
          evaluatedCount++;
        }
        if (typeof c.interview_score === 'number' && c.interview_score >= 0) {
          totalInterview += c.interview_score;
          interviewScoreCount++;
        }
      });

      setStats({ total: candidates.length, pending, shortlisted, rejected, interviewPending, interviewDone, interviewPassed, interviewFailed });

      const rawPie = [
        { name: 'Pending',           value: pending },
        { name: 'Shortlisted',       value: shortlisted },
        { name: 'Rejected',          value: rejected },
        { name: 'Interview Pending', value: interviewPending },
        { name: 'Interview Done',    value: interviewDone + interviewPassed + interviewFailed },
      ].filter(d => d.value > 0);
      setPieData(rawPie);

      const bars = [];
      if (evaluatedCount > 0) {
        bars.push({ name: 'Resume',    score: +(totalResume  / evaluatedCount).toFixed(1) });
        bars.push({ name: 'GitHub',    score: +(totalGithub  / evaluatedCount).toFixed(1) });
        bars.push({ name: 'Coding',    score: +(totalCoding  / evaluatedCount).toFixed(1) });
      }
      if (interviewScoreCount > 0) {
        bars.push({ name: 'Interview', score: +(totalInterview / interviewScoreCount).toFixed(1) });
      }
      setAvgScores(bars);
      setError(null);
      setLoading(false);
    } catch (err) {
      console.error(err);
      setError('Failed to fetch candidate data. Ensure the backend server is running.');
      setLoading(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 rounded-full border-2 border-[#1DB954]/30 border-t-[#1DB954] animate-spin" />
        <p className="text-sm font-bold animate-pulse" style={{ color: SP.green }}>Loading intelligence data...</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="p-6 m-6 rounded-2xl text-sm font-medium"
      style={{ background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.25)', color: '#fda4af' }}>
      {error}
    </div>
  );

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8 animate-fade-in">
      {/* Header */}
      <div className="pt-8 md:pt-0 animate-slide-up">
        <h1 className="text-2xl md:text-4xl font-black text-white">Intelligence Dashboard</h1>
        <p className="mt-2 text-sm md:text-base" style={{ color: SP.sub }}>
          Real-time candidate evaluation &amp; screening metrics
        </p>
      </div>

      {/* Top stat row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-slide-up delay-75">
        <StatCard icon={<Users      className="w-5 h-5"/>} title="Total Candidates"  value={stats.total}      />
        <StatCard icon={<Clock      className="w-5 h-5"/>} title="Pending Review"    value={stats.pending}    accent="#f59e0b" />
        <StatCard icon={<CheckCircle2 className="w-5 h-5"/>} title="Shortlisted"    value={stats.shortlisted} accent="#1DB954" />
        <StatCard icon={<XCircle    className="w-5 h-5"/>} title="Rejected"          value={stats.rejected}   accent="#f43f5e" />
      </div>

      {/* Screening round row */}
      <div className="animate-slide-up delay-150">
        <h2 className="text-xs font-black uppercase tracking-widest mb-4 flex items-center gap-2" style={{ color: SP.muted }}>
          <Mic className="w-4 h-4" style={{ color: SP.green }} /> AI Screening Round
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={<Mic         className="w-5 h-5"/>} title="Interview Sent"      value={stats.interviewPending} accent="#3b82f6" />
          <StatCard icon={<TrendingUp  className="w-5 h-5"/>} title="Evaluating"          value={stats.interviewDone}    accent="#1DB954" />
          <StatCard icon={<CheckCircle2 className="w-5 h-5"/>} title="Interview Passed"   value={stats.interviewPassed}  accent="#1DB954" />
          <StatCard icon={<XCircle     className="w-5 h-5"/>} title="Interview Failed"    value={stats.interviewFailed}  accent="#f43f5e" />
        </div>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-slide-up delay-225">
        {/* Pie — Pipeline distribution */}
        <div className="p-6 md:p-8 rounded-2xl" style={{ background: SP.surface, border: `1px solid ${SP.border}` }}>
          <h2 className="text-base md:text-xl font-bold text-white mb-6 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ background: SP.green }} />
            Pipeline Distribution
          </h2>
          <div className="h-64 md:h-80 w-full">
            {pieData.length > 0 ? (
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%" cy="50%"
                    innerRadius="55%" outerRadius="75%"
                    paddingAngle={5}
                    dataKey="value"
                    stroke="rgba(255,255,255,0.03)"
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#242424',
                      border: '1px solid rgba(255,255,255,0.10)',
                      borderRadius: '12px',
                      color: '#fff',
                      fontSize: '13px',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-sm font-medium" style={{ color: SP.muted }}>
                No data yet
              </div>
            )}
          </div>

          {/* Custom legend */}
          {pieData.length > 0 && (
            <div className="flex flex-wrap gap-3 mt-4">
              {pieData.map((d, i) => (
                <div key={d.name} className="flex items-center gap-1.5 text-xs font-medium" style={{ color: SP.sub }}>
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                  {d.name} ({d.value})
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bar — Average AI Scores */}
        <div className="p-6 md:p-8 rounded-2xl" style={{ background: SP.surface, border: `1px solid ${SP.border}` }}>
          <h2 className="text-base md:text-xl font-bold text-white mb-6 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ background: '#3b82f6' }} />
            Average AI Scores (out of 10)
          </h2>
          <div className="h-64 md:h-80 w-full">
            {avgScores.length > 0 ? (
              <ResponsiveContainer>
                <BarChart data={avgScores} margin={{ top: 20, right: 20, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: SP.sub, fontSize: 12 }} />
                  <YAxis axisLine={false} tickLine={false} domain={[0, 10]} tick={{ fill: SP.sub, fontSize: 12 }} />
                  <Tooltip
                    cursor={{ fill: 'rgba(29,185,84,0.05)' }}
                    contentStyle={{
                      backgroundColor: '#242424',
                      border: '1px solid rgba(255,255,255,0.10)',
                      borderRadius: '12px',
                      color: '#fff',
                      fontSize: '13px',
                    }}
                  />
                  <Bar dataKey="score" radius={[6, 6, 0, 0]} barSize={40}
                    label={{ position: 'top', fill: SP.sub, fontSize: 11, fontWeight: 700 }}>
                    {avgScores.map((entry, i) => (
                      <Cell key={i} fill={BAR_COLORS[entry.name] || SP.green} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-sm font-medium" style={{ color: SP.muted }}>
                Evaluate candidates to generate AI scores
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

/* ── Stat Card ──────────────────────────────────────────────────── */
const StatCard = ({ icon, title, value, accent = '#ffffff' }) => (
  <div
    className="p-5 md:p-6 rounded-2xl relative overflow-hidden group transition-all duration-300 hover:-translate-y-1"
    style={{
      background: '#181818',
      border: '1px solid rgba(255,255,255,0.07)',
    }}
    onMouseEnter={e => {
      e.currentTarget.style.background = '#242424';
      e.currentTarget.style.borderColor = `${accent}30`;
      e.currentTarget.style.boxShadow = `0 0 20px ${accent}15`;
    }}
    onMouseLeave={e => {
      e.currentTarget.style.background = '#181818';
      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)';
      e.currentTarget.style.boxShadow = 'none';
    }}
  >
    <div
      className="w-9 h-9 rounded-full flex items-center justify-center mb-4"
      style={{ background: `${accent}15`, color: accent }}
    >
      {icon}
    </div>
    <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#535353' }}>{title}</h3>
    <p className="text-4xl md:text-5xl font-black mt-2" style={{ color: accent === '#ffffff' ? '#fff' : accent }}>
      {value}
    </p>
  </div>
);

export default Dashboard;
