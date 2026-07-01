import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  GitBranch, FileText, Code2, Play, Pause, ExternalLink,
  ChevronDown, ChevronUp, Loader2, ClipboardList, X,
  Mail, User, Link2,
} from 'lucide-react';

/* ─────────────────────────────────────────────
   URL helpers — strip any existing base URL so
   we never end up with double-prefix links.
───────────────────────────────────────────── */
const stripPrefix = (value, ...prefixes) => {
  if (!value) return value;
  let v = value.trim();
  for (const prefix of prefixes) {
    if (v.toLowerCase().startsWith(prefix.toLowerCase())) {
      v = v.slice(prefix.length);
    }
  }
  // Remove any leading slashes left over
  return v.replace(/^\/+/, '');
};

const githubUrl = (raw) => {
  if (!raw) return null;
  const username = stripPrefix(raw, 'https://github.com/', 'http://github.com/', 'github.com/');
  return username ? `https://github.com/${username}` : null;
};

const leetcodeUrl = (raw) => {
  if (!raw) return null;
  const username = stripPrefix(
    raw,
    'https://leetcode.com/u/', 'http://leetcode.com/u/',
    'https://leetcode.com/',   'http://leetcode.com/',
    'leetcode.com/u/',         'leetcode.com/',
  );
  return username ? `https://leetcode.com/u/${username}` : null;
};

const linkedinUrl = (raw) => {
  if (!raw) return null;
  // If it already starts with http, return as-is; otherwise build the full URL
  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const username = stripPrefix(trimmed, 'linkedin.com/in/', 'www.linkedin.com/in/');
  return `https://www.linkedin.com/in/${username}`;
};

/* ─────────────────────────────────────────────
   Form-Response Modal
───────────────────────────────────────────── */
const FormResponseModal = ({ candidate, onClose }) => {
  const fields = [
    {
      label: 'Full Name',
      value: candidate.name,
      icon: <User className="w-4 h-4" />,
    },
    {
      label: 'Email Address',
      value: candidate.email,
      icon: <Mail className="w-4 h-4" />,
      href: `mailto:${candidate.email}`,
    },
    {
      label: 'LinkedIn Profile',
      value: candidate.linkedin_url || '—',
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
        </svg>
      ),
      href: linkedinUrl(candidate.linkedin_url),
      isLink: !!candidate.linkedin_url,
    },
    {
      label: 'Resume Link',
      value: candidate.resume_url || '—',
      icon: <FileText className="w-4 h-4" />,
      href: candidate.resume_url,
      isLink: true,
      truncate: true,
    },
    {
      label: 'GitHub Profile',
      value: candidate.github_username || '—',
      icon: <GitBranch className="w-4 h-4" />,
      href: githubUrl(candidate.github_username),
      isLink: !!candidate.github_username,
    },
    {
      label: 'Coding Platform (LeetCode)',
      value: candidate.leetcode_username || '—',
      icon: <Code2 className="w-4 h-4" />,
      href: leetcodeUrl(candidate.leetcode_username),
      isLink: !!candidate.leetcode_username,
    },
  ];

  let stageLabel = 'Rejected';
  let stageCls = 'bg-rose-500/15 text-rose-400 border-rose-500/30';
  
  const stageLower = candidate.stage?.toLowerCase() || '';
  
  if (stageLower === 'pending') {
    stageLabel = 'Pending Review';
    stageCls = 'bg-amber-500/15 text-amber-400 border-amber-500/30';
  } else if (stageLower === 'shortlisted') {
    stageLabel = 'Shortlisted';
    stageCls = 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
  } else if (stageLower === 'assessment_sent' || stageLower === 'email_sent') {
    stageLabel = 'Interview Sent';
    stageCls = 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30';
  } else if (stageLower === 'interview_completed') {
    stageLabel = 'Screening Done';
    stageCls = 'bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30';
  } else if (stageLower === 'interview_passed') {
    stageLabel = 'Interview Passed';
    stageCls = 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
  } else if (stageLower === 'interview_failed') {
    stageLabel = 'Interview Failed';
    stageCls = 'bg-rose-500/15 text-rose-400 border-rose-500/30';
  } else if (stageLower === 'rejected') {
    stageLabel = 'Rejected';
    stageCls = 'bg-rose-500/15 text-rose-400 border-rose-500/30';
  } else if (candidate.final_score >= 6) {
    stageLabel = 'Shortlisted';
    stageCls = 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
  }

  const stageBadge = { label: stageLabel, cls: stageCls };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backdropFilter: 'blur(12px)', backgroundColor: 'rgba(0,0,0,0.80)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl"
        style={{ background: '#181818', border: '1px solid rgba(255,255,255,0.08)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-6" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg,#1DB954,#158a3e)' }}>
              <ClipboardList className="w-5 h-5 text-black" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white tracking-tight">Form Response</h2>
              <p className="text-xs mt-0.5" style={{ color: '#b3b3b3' }}>Submitted application details</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-xs font-bold px-3 py-1 rounded-full border ${stageBadge.cls}`}>
              {stageBadge.label}
            </span>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center transition-all"
              style={{ background: 'rgba(255,255,255,0.08)', color: '#b3b3b3' }}
              onMouseEnter={e => { e.currentTarget.style.background='rgba(255,255,255,0.15)'; e.currentTarget.style.color='#fff'; }}
              onMouseLeave={e => { e.currentTarget.style.background='rgba(255,255,255,0.08)'; e.currentTarget.style.color='#b3b3b3'; }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Candidate name banner */}
        <div className="px-6 py-4 flex items-center gap-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'rgba(0,0,0,0.25)' }}>
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-black font-black text-lg flex-shrink-0"
            style={{ background: 'linear-gradient(135deg,#1DB954,#158a3e)' }}
          >
            {candidate.name?.charAt(0)?.toUpperCase() || '?'}
          </div>
          <div>
            <p className="font-bold text-white text-base">{candidate.name}</p>
            <p className="text-xs" style={{ color: '#b3b3b3' }}>{candidate.email}</p>
          </div>
          {candidate.final_score > 0 && (
            <div className="ml-auto text-right">
              <p className="text-2xl font-black" style={{ color: candidate.final_score >= 6 ? '#1DB954' : '#f43f5e' }}>
                {candidate.final_score}
                <span className="text-sm font-bold" style={{ color: '#535353' }}>/10</span>
              </p>
              <p className="text-[10px] uppercase tracking-widest" style={{ color: '#535353' }}>AI Score</p>
            </div>
          )}
        </div>

        {/* Form fields */}
        <div className="p-6 space-y-3 max-h-[55vh] overflow-y-auto custom-scrollbar">
          {fields.map((field, i) => (
            <div
              key={i}
              className="flex items-start gap-3 p-3.5 rounded-xl transition-colors"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
              onMouseEnter={e => e.currentTarget.style.borderColor='rgba(29,185,84,0.25)'}
              onMouseLeave={e => e.currentTarget.style.borderColor='rgba(255,255,255,0.06)'}
            >
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{ background: 'rgba(29,185,84,0.08)', border: '1px solid rgba(29,185,84,0.15)', color: '#1DB954' }}>
                {field.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: '#535353' }}>
                  {field.label}
                </p>
                {field.isLink && field.href ? (
                  <a
                    href={field.href}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-medium break-all flex items-center gap-1.5 group/link transition-colors"
                    style={{ color: '#1DB954' }}
                    onMouseEnter={e => e.currentTarget.style.color='#1ed760'}
                    onMouseLeave={e => e.currentTarget.style.color='#1DB954'}
                  >
                    <span className={field.truncate ? 'truncate block max-w-xs' : ''}>{field.value}</span>
                    <ExternalLink className="w-3 h-3 flex-shrink-0 opacity-50 group-hover/link:opacity-100 transition-opacity" />
                  </a>
                ) : (
                  <p className="text-sm text-white font-medium break-all">{field.value}</p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 flex items-center justify-between" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <p className="text-xs font-medium" style={{ color: '#535353' }}>Candidate ID: #{candidate.id}</p>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-full text-xs font-bold transition-all"
            style={{ background: 'rgba(255,255,255,0.08)', color: '#b3b3b3', border: '1px solid rgba(255,255,255,0.1)' }}
            onMouseEnter={e => { e.currentTarget.style.background='rgba(255,255,255,0.15)'; e.currentTarget.style.color='#fff'; }}
            onMouseLeave={e => { e.currentTarget.style.background='rgba(255,255,255,0.08)'; e.currentTarget.style.color='#b3b3b3'; }}
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

/* ─────────────────────────────────────────────
   Custom Audio Player
───────────────────────────────────────────── */
const CustomAudioPlayer = ({ src }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef(null);

  const togglePlayPause = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(e => console.error("Error playing audio:", e));
    }
    setIsPlaying(!isPlaying);
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      // Browsers sometimes struggle with WebM duration, fallback handled
      setDuration(audioRef.current.duration === Infinity ? 0 : audioRef.current.duration);
    }
  };

  const handleProgressChange = (e) => {
    if (audioRef.current) {
      const newTime = (e.target.value / 100) * duration;
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const formatTime = (time) => {
    if (isNaN(time) || !isFinite(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  return (
    <div className="flex items-center gap-3 p-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
      <audio
        ref={audioRef}
        src={src}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={() => setIsPlaying(false)}
        preload="metadata"
      />
      <button
        onClick={togglePlayPause}
        className="w-8 h-8 flex-shrink-0 rounded-full flex items-center justify-center transition-all"
        style={{ background: 'rgba(29,185,84,0.15)', color: '#1DB954', border: '1px solid rgba(29,185,84,0.3)' }}
        onMouseEnter={e => { e.currentTarget.style.background = '#1DB954'; e.currentTarget.style.color = '#000'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(29,185,84,0.15)'; e.currentTarget.style.color = '#1DB954'; }}
      >
        {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
      </button>
      
      <div className="flex-1 flex items-center gap-2">
        <span className="text-[10px] font-bold" style={{ color: '#b3b3b3', minWidth: '28px', textAlign: 'right' }}>
          {formatTime(currentTime)}
        </span>
        <div className="relative flex-1 flex items-center h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.1)' }}>
          <div 
            className="absolute left-0 top-0 h-full rounded-full pointer-events-none" 
            style={{ background: '#1DB954', width: duration ? `${(currentTime / duration) * 100}%` : '0%' }}
          />
          <input
            type="range"
            min="0"
            max="100"
            value={duration ? (currentTime / duration) * 100 : 0}
            onChange={handleProgressChange}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        </div>
        <span className="text-[10px] font-bold" style={{ color: '#535353', minWidth: '28px' }}>
          {formatTime(duration)}
        </span>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────
   Candidate Card
───────────────────────────────────────────── */
const CandidateCard = ({ candidate, onEvaluate }) => {
  const [expanded, setExpanded] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [showFormResponse, setShowFormResponse] = useState(false);

  const handleEvalClick = async () => {
    setEvaluating(true);
    await onEvaluate();
    setEvaluating(false);
  };

  const isNonPending =
    candidate.stage && candidate.stage.toLowerCase() !== 'pending';

  return (
    <>
      {showFormResponse && (
        <FormResponseModal
          candidate={candidate}
          onClose={() => setShowFormResponse(false)}
        />
      )}

      <div
        className="rounded-2xl overflow-hidden group transition-all duration-300 hover:-translate-y-1 animate-scale-in"
        style={{
          background: '#181818',
          border: '1px solid rgba(255,255,255,0.06)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = '#242424';
          e.currentTarget.style.borderColor = 'rgba(29,185,84,0.30)';
          e.currentTarget.style.boxShadow = '0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(29,185,84,0.10)';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = '#181818';
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
          e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.4)';
        }}
      >
        <div className="p-5">
          {/* Top row — name + eval button (pending only) */}
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-3 min-w-0">
              {/* Avatar */}
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-black font-black text-sm flex-shrink-0"
                style={{ background: 'linear-gradient(135deg,#1DB954,#158a3e)' }}
              >
                {candidate.name?.charAt(0)?.toUpperCase() || '?'}
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-white text-base tracking-tight truncate">{candidate.name}</h3>
                <p className="text-xs truncate mt-0.5" style={{ color: '#b3b3b3' }} title={candidate.email}>
                  {candidate.email}
                </p>
              </div>
            </div>

            {candidate.stage && candidate.stage.toLowerCase() === 'pending' && (
              <button
                onClick={handleEvalClick}
                disabled={evaluating}
                className="text-xs font-black px-3 py-1.5 rounded-full flex items-center gap-1.5 transition-all disabled:opacity-50 flex-shrink-0 ml-2"
                style={{ background: 'rgba(29,185,84,0.12)', color: '#1DB954', border: '1px solid rgba(29,185,84,0.25)' }}
                onMouseEnter={e => { if (!evaluating) { e.currentTarget.style.background='#1DB954'; e.currentTarget.style.color='#000'; }}}
                onMouseLeave={e => { e.currentTarget.style.background='rgba(29,185,84,0.12)'; e.currentTarget.style.color='#1DB954'; }}
              >
                {evaluating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3 fill-current" />}
                {evaluating ? 'Eval...' : 'Evaluate'}
              </button>
            )}
          </div>

          {/* Score Box — shown for all non-pending candidates */}
          {candidate.stage && candidate.stage.toLowerCase() !== 'pending' && (
            <div
              className="rounded-xl p-3 mb-3 space-y-2"
              style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              {/* Profile Score row */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider flex-shrink-0" style={{ color: '#535353' }}>
                  Profile Score
                </span>
                {candidate.final_score > 0 ? (
                  <span
                    className="text-sm font-black px-2.5 py-0.5 rounded-lg flex-shrink-0"
                    style={{
                      background: candidate.final_score >= 7 ? 'rgba(29,185,84,0.12)' : candidate.final_score >= 4 ? 'rgba(245,158,11,0.12)' : 'rgba(244,63,94,0.12)',
                      color: candidate.final_score >= 7 ? '#1DB954' : candidate.final_score >= 4 ? '#f59e0b' : '#f43f5e',
                      border: `1px solid ${candidate.final_score >= 7 ? 'rgba(29,185,84,0.25)' : candidate.final_score >= 4 ? 'rgba(245,158,11,0.25)' : 'rgba(244,63,94,0.25)'}`,
                    }}
                  >
                    {candidate.final_score}/10
                  </span>
                ) : (
                  <span className="text-xs font-bold" style={{ color: '#535353' }}>—</span>
                )}
              </div>
              {/* Interview Score row */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider flex-shrink-0" style={{ color: '#535353' }}>
                  Interview Score
                </span>
                {typeof candidate.interview_score === 'number' && candidate.interview_score >= 0 ? (
                  <span
                    className="text-sm font-black px-2.5 py-0.5 rounded-lg flex-shrink-0"
                    style={{
                      background: candidate.interview_score >= 7 ? 'rgba(29,185,84,0.12)' : candidate.interview_score >= 4 ? 'rgba(245,158,11,0.12)' : 'rgba(244,63,94,0.12)',
                      color: candidate.interview_score >= 7 ? '#1DB954' : candidate.interview_score >= 4 ? '#f59e0b' : '#f43f5e',
                      border: `1px solid ${candidate.interview_score >= 7 ? 'rgba(29,185,84,0.25)' : candidate.interview_score >= 4 ? 'rgba(245,158,11,0.25)' : 'rgba(244,63,94,0.25)'}`,
                    }}
                  >
                    {candidate.interview_score}/10
                  </span>
                ) : (
                  <span className="text-xs font-bold italic" style={{ color: '#535353' }}>-NIL-</span>
                )}
              </div>
            </div>
          )}

          {/* Quick-link icon row */}
          <div className="flex gap-2 mt-4 flex-wrap">
            {candidate.resume_url && (
              <a href={candidate.resume_url} target="_blank" rel="noreferrer" title="View Resume"
                className="flex items-center justify-center w-8 h-8 rounded-full transition-all"
                style={{ background:'rgba(255,255,255,0.06)', color:'#b3b3b3', border:'1px solid rgba(255,255,255,0.08)' }}
                onMouseEnter={e => { e.currentTarget.style.background='rgba(29,185,84,0.12)'; e.currentTarget.style.color='#1DB954'; e.currentTarget.style.borderColor='rgba(29,185,84,0.25)'; }}
                onMouseLeave={e => { e.currentTarget.style.background='rgba(255,255,255,0.06)'; e.currentTarget.style.color='#b3b3b3'; e.currentTarget.style.borderColor='rgba(255,255,255,0.08)'; }}
              >
                <FileText className="w-3.5 h-3.5" />
              </a>
            )}
            {candidate.github_username && githubUrl(candidate.github_username) && (
              <a href={githubUrl(candidate.github_username)} target="_blank" rel="noreferrer" title="View GitHub"
                className="flex items-center justify-center w-8 h-8 rounded-full transition-all"
                style={{ background:'rgba(255,255,255,0.06)', color:'#b3b3b3', border:'1px solid rgba(255,255,255,0.08)' }}
                onMouseEnter={e => { e.currentTarget.style.background='rgba(255,255,255,0.12)'; e.currentTarget.style.color='#fff'; }}
                onMouseLeave={e => { e.currentTarget.style.background='rgba(255,255,255,0.06)'; e.currentTarget.style.color='#b3b3b3'; }}
              >
                <GitBranch className="w-3.5 h-3.5" />
              </a>
            )}
            {candidate.leetcode_username && leetcodeUrl(candidate.leetcode_username) && (
              <a href={leetcodeUrl(candidate.leetcode_username)} target="_blank" rel="noreferrer" title="View LeetCode"
                className="flex items-center justify-center w-8 h-8 rounded-full transition-all"
                style={{ background:'rgba(255,255,255,0.06)', color:'#b3b3b3', border:'1px solid rgba(255,255,255,0.08)' }}
                onMouseEnter={e => { e.currentTarget.style.background='rgba(249,115,22,0.12)'; e.currentTarget.style.color='#f97316'; }}
                onMouseLeave={e => { e.currentTarget.style.background='rgba(255,255,255,0.06)'; e.currentTarget.style.color='#b3b3b3'; }}
              >
                <Code2 className="w-3.5 h-3.5" />
              </a>
            )}
            {candidate.linkedin_url && linkedinUrl(candidate.linkedin_url) && (
              <a href={linkedinUrl(candidate.linkedin_url)} target="_blank" rel="noreferrer" title="View LinkedIn"
                className="flex items-center justify-center w-8 h-8 rounded-full transition-all"
                style={{ background:'rgba(255,255,255,0.06)', color:'#b3b3b3', border:'1px solid rgba(255,255,255,0.08)' }}
                onMouseEnter={e => { e.currentTarget.style.background='rgba(59,130,246,0.12)'; e.currentTarget.style.color='#3b82f6'; }}
                onMouseLeave={e => { e.currentTarget.style.background='rgba(255,255,255,0.06)'; e.currentTarget.style.color='#b3b3b3'; }}
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                </svg>
              </a>
            )}
          </div>

          {/* View Form Response */}
          {isNonPending && (
            <div className="mt-4 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <button
                onClick={() => setShowFormResponse(true)}
                className="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl text-xs font-bold group/form transition-all"
                style={{ background:'rgba(29,185,84,0.06)', border:'1px solid rgba(29,185,84,0.15)', color:'#1DB954' }}
                onMouseEnter={e => { e.currentTarget.style.background='rgba(29,185,84,0.12)'; e.currentTarget.style.borderColor='rgba(29,185,84,0.30)'; }}
                onMouseLeave={e => { e.currentTarget.style.background='rgba(29,185,84,0.06)'; e.currentTarget.style.borderColor='rgba(29,185,84,0.15)'; }}
              >
                <ClipboardList className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="flex-1 text-left">View form response</span>
                <ExternalLink className="w-3 h-3 opacity-50 group-hover/form:opacity-100 transition-opacity" />
              </button>
            </div>
          )}

          {/* AI Reasoning toggle */}
          {isNonPending && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="w-full mt-3 flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-widest transition-colors pt-3"
              style={{ borderTop: '1px solid rgba(255,255,255,0.06)', color: expanded ? '#1DB954' : '#535353' }}
              onMouseEnter={e => e.currentTarget.style.color='#1DB954'}
              onMouseLeave={e => e.currentTarget.style.color= expanded ? '#1DB954' : '#535353'}
            >
              {expanded ? 'Hide Details' : 'AI Reasoning'}
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>

        {/* Expanded AI scores */}
        {expanded && isNonPending && (
          <div className="px-5 pb-5 pt-3 space-y-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', background:'rgba(0,0,0,0.25)' }}>
            <ScoreDetail label="Resume" score={candidate.resume_score} reason={candidate.resume_reasoning} />
            <ScoreDetail label="GitHub" score={candidate.github_score} reason={candidate.github_reasoning} />
            <ScoreDetail label="Coding" score={candidate.coding_score} reason={candidate.coding_reasoning} />

            {candidate.interview_score >= 0 ? (
              <div className="pt-4 space-y-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-widest" style={{ color:'#535353' }}>Interview Result</span>
                  <div className="flex items-center gap-2">
                    {candidate.interview_status && (
                      <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-lg border ${
                        candidate.interview_status === 'cleared'
                          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                          : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                      }`}>
                        {candidate.interview_status === 'cleared' ? '✓ Cleared' : '✗ Rejected'}
                      </span>
                    )}
                    {candidate.interview_shortlisted && (
                      <span className="text-[10px] font-black uppercase px-2.5 py-1 rounded-lg" style={{ background:'rgba(29,185,84,0.12)', color:'#1DB954', border:'1px solid rgba(29,185,84,0.25)' }}>Shortlisted</span>
                    )}
                  </div>
                </div>

                <ScoreDetail label="AI Interview Score" score={candidate.interview_score} reason={candidate.interview_reasoning} />



                {candidate.interview_transcript && (
                  <div className="p-4 rounded-xl space-y-2" style={{ background:'rgba(0,0,0,0.4)', border:'1px solid rgba(255,255,255,0.06)' }}>
                    <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color:'#535353' }}>Interview Transcript</p>
                    <div className="space-y-3 max-h-48 overflow-y-auto custom-scrollbar pt-1">
                      {candidate.interview_transcript.map((item, idx) => (
                        <div key={idx} className="space-y-1 text-xs pb-2.5 last:pb-0" style={{ borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
                          <p className="font-bold" style={{ color:'#1DB954' }}>Q{idx + 1}: {item.question}</p>
                          <p className="italic" style={{ color:'#b3b3b3' }}>&ldquo; {item.answer} &rdquo;</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              (candidate.stage?.toLowerCase() === 'assessment_sent' || candidate.stage?.toLowerCase() === 'email_sent' || candidate.stage?.toLowerCase() === 'invited') && (
                <div className="pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="p-3 rounded-xl text-xs font-semibold flex items-center justify-between"
                    style={{ background:'rgba(29,185,84,0.06)', color:'#1DB954', border:'1px solid rgba(29,185,84,0.15)' }}>
                    <span>Interview Link Emailed</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background:'rgba(29,185,84,0.15)' }}>Awaiting response</span>
                  </div>
                </div>
              )
            )}

            {candidate.stage?.toLowerCase() === 'interview_completed' && candidate.interview_score === -1 && (
              <div className="pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="p-3 rounded-xl text-xs font-semibold flex items-center gap-2"
                  style={{ background:'rgba(29,185,84,0.06)', color:'#1DB954', border:'1px solid rgba(29,185,84,0.15)' }}>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Interview completed. AI screening evaluation in progress...</span>
                </div>
              </div>
            )}

            {candidate.stage?.toLowerCase() === 'rejected' && candidate.rejection_reason && (
              <div className="mt-4 p-3 rounded-xl text-xs font-medium" style={{ background:'rgba(244,63,94,0.08)', color:'#fda4af', border:'1px solid rgba(244,63,94,0.2)' }}>
                {candidate.rejection_reason}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
};

/* ─────────────────────────────────────────────
   Score Detail row
───────────────────────────────────────────── */
const ScoreDetail = ({ label, score, reason }) => {
  const color = score >= 7 ? '#1DB954' : score >= 4 ? '#f59e0b' : '#f43f5e';
  const bg    = score >= 7 ? 'rgba(29,185,84,0.08)' : score >= 4 ? 'rgba(245,158,11,0.08)' : 'rgba(244,63,94,0.08)';
  const bord  = score >= 7 ? 'rgba(29,185,84,0.20)' : score >= 4 ? 'rgba(245,158,11,0.20)' : 'rgba(244,63,94,0.20)';
  return (
    <div>
      <div className="flex justify-between items-center text-xs font-bold mb-1.5">
        <span style={{ color: '#b3b3b3' }}>{label}</span>
        <span className="px-2 py-0.5 rounded-md text-xs font-black" style={{ background: bg, color, border: `1px solid ${bord}` }}>
          {score ?? '—'}/10
        </span>
      </div>
      <p className="text-[11px] leading-relaxed p-3 rounded-xl" style={{ color:'#b3b3b3', background:'rgba(0,0,0,0.35)', border:'1px solid rgba(255,255,255,0.05)' }}>
        {reason || 'No reasoning provided.'}
      </p>
    </div>
  );
};

export default CandidateCard;
