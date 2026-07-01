import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { Save, CheckCircle, FileSignature, Play, Loader2 } from 'lucide-react';

const SP = {
  surface:  '#181818',
  surface2: '#242424',
  border:   'rgba(255,255,255,0.07)',
  green:    '#1DB954',
  greenDark:'#158a3e',
  sub:      '#b3b3b3',
  muted:    '#535353',
};

const JobDescription = () => {
  const [jd, setJd] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/job-description')
      .then(res => setJd(res.data.content))
      .catch(err => console.error(err));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await api.post('/job-description', { content: jd });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8 pt-8 md:pt-0">
        <h1 className="text-2xl md:text-4xl font-black text-white flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: `${SP.green}15` }}
          >
            <FileSignature className="w-5 h-5" style={{ color: SP.green }} />
          </div>
          Job Context
        </h1>
        <p className="mt-2 text-sm md:text-base ml-0 md:ml-14" style={{ color: SP.sub }}>
          Define the requirements for the AI agent to evaluate against.
        </p>
      </div>

      {/* Editor card */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: SP.surface, border: `1px solid ${SP.border}`, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
      >
        {/* Toolbar */}
        <div
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 md:p-5"
          style={{ borderBottom: `1px solid ${SP.border}`, background: 'rgba(0,0,0,0.3)' }}
        >
          {/* macOS-style traffic lights */}
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-rose-500" />
            <span className="w-3 h-3 rounded-full bg-amber-500" />
            <span className="w-3 h-3 rounded-full bg-[#1DB954]" />
            <span className="ml-3 text-xs font-mono" style={{ color: SP.muted }}>job_description.txt</span>
          </div>

          <div className="flex flex-col xs:flex-row gap-3 w-full sm:w-auto">
            {/* Save button */}
            <button
              onClick={handleSave}
              disabled={saving || evaluating}
              className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={saved
                ? { background: `${SP.green}15`, color: SP.green, border: `1px solid ${SP.green}30` }
                : { background: SP.green, color: '#000' }
              }
              onMouseEnter={e => { if (!saving && !evaluating && !saved) e.currentTarget.style.background = '#1ed760'; }}
              onMouseLeave={e => { if (!saving && !evaluating && !saved) e.currentTarget.style.background = SP.green; }}
            >
              {saved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              {saving ? 'Saving...' : saved ? 'Saved!' : 'Save AI Context'}
            </button>

            {/* Evaluate button */}
            <button
              onClick={async () => {
                setEvaluating(true);
                try {
                  await api.post('/run-pipeline');
                  navigate('/');
                } catch (error) {
                  console.error(error);
                  alert('Error evaluating candidates. Is the backend running?');
                } finally {
                  setEvaluating(false);
                }
              }}
              disabled={evaluating || saving}
              className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: 'rgba(255,255,255,0.08)', color: SP.sub, border: `1px solid ${SP.border}` }}
              onMouseEnter={e => { if (!evaluating && !saving) { e.currentTarget.style.background = 'rgba(255,255,255,0.14)'; e.currentTarget.style.color = '#fff'; }}}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = SP.sub; }}
            >
              {evaluating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {evaluating ? 'Evaluating...' : 'Evaluate Candidates'}
            </button>
          </div>
        </div>

        {/* Textarea */}
        <textarea
          value={jd}
          onChange={(e) => setJd(e.target.value)}
          className="w-full p-6 md:p-8 focus:outline-none resize-none font-mono text-sm leading-relaxed custom-scrollbar"
          style={{
            background: 'transparent',
            color: '#e2e8f0',
            minHeight: '60vh',
            height: 'calc(100vh - 340px)',
            caretColor: SP.green,
          }}
          placeholder="// Paste the complete job description here..."
          spellCheck="false"
        />
      </div>
    </div>
  );
};

export default JobDescription;
