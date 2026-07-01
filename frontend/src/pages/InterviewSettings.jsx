import { useState, useEffect } from 'react';
import { HelpCircle, Plus, Trash2, Clock, Check, Loader2, Settings2 } from 'lucide-react';
import api from '../api';

const SP = {
  surface:  '#181818',
  surface2: '#242424',
  border:   'rgba(255,255,255,0.07)',
  green:    '#1DB954',
  sub:      '#b3b3b3',
  muted:    '#535353',
};

const InterviewSettings = () => {
  const [questions, setQuestions] = useState([]);
  const [newQuestionText, setNewQuestionText] = useState('');
  const [timerLimit, setTimerLimit] = useState(120);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => { fetchSettings(); }, []);

  const fetchSettings = async () => {
    try {
      const res = await api.get('/interview/settings');
      setQuestions(res.data.questions || []);
      setTimerLimit(res.data.timer_limit || 120);
      setLoading(false);
    } catch (err) {
      console.error(err);
      setError('Failed to load interview settings. Ensure backend is running.');
      setLoading(false);
    }
  };

  const handleAddQuestion = (e) => {
    e.preventDefault();
    if (!newQuestionText.trim()) return;
    setQuestions([...questions, newQuestionText.trim()]);
    setNewQuestionText('');
  };

  const handleRemoveQuestion = (index) => {
    const updated = [...questions];
    updated.splice(index, 1);
    setQuestions(updated);
  };

  const handleQuestionChange = (index, value) => {
    const updated = [...questions];
    updated[index] = value;
    setQuestions(updated);
  };

  const handleSave = async () => {
    setSaving(true);
    setSuccess(false);
    setError(null);
    try {
      await api.post('/interview/settings', { questions, timer_limit: Number(timerLimit) });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error(err);
      setError('Failed to save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 rounded-full border-2 border-[#1DB954]/30 border-t-[#1DB954] animate-spin" />
        <p className="text-sm font-bold animate-pulse" style={{ color: SP.green }}>Loading interview settings...</p>
      </div>
    </div>
  );

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pt-8 md:pt-0 animate-slide-up">
        <div>
          <h1 className="text-2xl md:text-4xl font-black text-white flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: `${SP.green}15` }}>
              <Settings2 className="w-5 h-5" style={{ color: SP.green }} />
            </div>
            Screening Settings
          </h1>
          <p className="mt-2 text-sm md:text-base" style={{ color: SP.sub }}>
            Configure virtual interview questions and timers
          </p>
        </div>
      </div>

      {/* Timer Config */}
      <div className="p-6 md:p-8 rounded-2xl space-y-5 animate-slide-up delay-75"
        style={{ background: SP.surface, border: `1px solid ${SP.border}` }}>
        <h2 className="text-base md:text-xl font-bold text-white flex items-center gap-3 pb-4"
          style={{ borderBottom: `1px solid ${SP.border}` }}>
          <div className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: `${SP.green}12` }}>
            <Clock className="w-4 h-4" style={{ color: SP.green }} />
          </div>
          Response Time Limit
        </h2>

        <div className="flex flex-col md:flex-row md:items-center gap-6">
          <div className="flex-1 space-y-1">
            <label className="text-xs font-bold uppercase tracking-wider" style={{ color: SP.muted }}>
              Time Limit per Question
            </label>
            <p className="text-xs" style={{ color: SP.muted }}>
              Maximum duration (seconds) a candidate has to speak their answer for each question.
            </p>
          </div>
          <div
            className="flex items-center gap-3 rounded-xl px-4 py-3 w-full md:w-52"
            style={{ background: SP.surface2, border: `1px solid ${SP.border}` }}
          >
            <input
              type="number"
              min="30"
              max="600"
              value={timerLimit}
              onChange={(e) => setTimerLimit(e.target.value)}
              className="bg-transparent text-white focus:outline-none w-full font-black text-xl text-center"
              style={{ caretColor: SP.green }}
            />
            <span className="text-xs font-bold uppercase" style={{ color: SP.muted }}>sec</span>
          </div>
        </div>

        {/* Visual timer bar */}
        <div>
          <div className="flex justify-between text-xs mb-1.5" style={{ color: SP.muted }}>
            <span>30s</span><span>600s</span>
          </div>
          <div className="w-full h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${((timerLimit - 30) / 570) * 100}%`, background: SP.green }}
            />
          </div>
        </div>
      </div>

      {/* Questions Manager */}
      <div className="p-6 md:p-8 rounded-2xl space-y-5 animate-slide-up delay-150"
        style={{ background: SP.surface, border: `1px solid ${SP.border}` }}>
        <h2 className="text-base md:text-xl font-bold text-white flex items-center gap-3 pb-4"
          style={{ borderBottom: `1px solid ${SP.border}` }}>
          <div className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: `${SP.green}12` }}>
            <HelpCircle className="w-4 h-4" style={{ color: SP.green }} />
          </div>
          Interview Questions
        </h2>

        <div className="space-y-3">
          {questions.map((q, idx) => (
            <div
              key={idx}
              className="flex items-start gap-3 p-4 rounded-xl transition-all"
              style={{ background: SP.surface2, border: `1px solid ${SP.border}` }}
              onMouseEnter={e => e.currentTarget.style.borderColor = `${SP.green}25`}
              onMouseLeave={e => e.currentTarget.style.borderColor = SP.border}
            >
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center font-black text-xs flex-shrink-0 mt-0.5"
                style={{ background: `${SP.green}15`, color: SP.green }}
              >
                {idx + 1}
              </div>
              <div className="flex-1">
                <textarea
                  rows="2"
                  value={q}
                  onChange={(e) => handleQuestionChange(idx, e.target.value)}
                  className="w-full bg-transparent font-medium text-sm focus:outline-none resize-none transition-colors"
                  style={{ color: '#e2e8f0', caretColor: SP.green }}
                />
              </div>
              <button
                type="button"
                onClick={() => handleRemoveQuestion(idx)}
                className="w-8 h-8 rounded-full flex items-center justify-center transition-all flex-shrink-0 self-center"
                style={{ background: 'rgba(255,255,255,0.05)', color: SP.muted }}
                onMouseEnter={e => { e.currentTarget.style.background='rgba(244,63,94,0.12)'; e.currentTarget.style.color='#f43f5e'; }}
                onMouseLeave={e => { e.currentTarget.style.background='rgba(255,255,255,0.05)'; e.currentTarget.style.color=SP.muted; }}
                title="Remove Question"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}

          {questions.length === 0 && (
            <div
              className="h-28 rounded-xl flex items-center justify-center text-sm font-medium"
              style={{ border: `2px dashed rgba(255,255,255,0.08)`, color: SP.muted }}
            >
              No interview questions added yet. Add one below!
            </div>
          )}
        </div>

        {/* Add New Question */}
        <form onSubmit={handleAddQuestion}
          className="flex flex-col sm:flex-row gap-3 pt-4"
          style={{ borderTop: `1px solid ${SP.border}` }}>
          <input
            type="text"
            placeholder="Type a new screening question..."
            value={newQuestionText}
            onChange={(e) => setNewQuestionText(e.target.value)}
            className="flex-1 rounded-xl px-5 py-3.5 text-sm font-medium text-white focus:outline-none transition-all"
            style={{
              background: SP.surface2,
              border: `1px solid ${SP.border}`,
              caretColor: SP.green,
            }}
            onFocus={e => e.currentTarget.style.borderColor = `${SP.green}40`}
            onBlur={e => e.currentTarget.style.borderColor = SP.border}
          />
          <button
            type="submit"
            disabled={!newQuestionText.trim()}
            className="flex items-center justify-center gap-2 px-6 py-3.5 rounded-full text-sm font-black transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: SP.green, color: '#000' }}
            onMouseEnter={e => { if (newQuestionText.trim()) e.currentTarget.style.background = '#1ed760'; }}
            onMouseLeave={e => e.currentTarget.style.background = SP.green}
          >
            <Plus className="w-4 h-4" /> Add
          </button>
        </form>
      </div>

      {/* Action Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-end gap-4 pb-6 animate-slide-up delay-225">
        {error && (
          <p className="text-sm font-bold px-4 py-2 rounded-full"
            style={{ background: 'rgba(244,63,94,0.10)', border: '1px solid rgba(244,63,94,0.25)', color: '#fda4af' }}>
            {error}
          </p>
        )}
        {success && (
          <p className="text-sm font-bold px-4 py-2 rounded-full flex items-center gap-1.5 animate-pulse"
            style={{ background: `${SP.green}10`, border: `1px solid ${SP.green}30`, color: SP.green }}>
            <Check className="w-4 h-4" /> Settings Saved!
          </p>
        )}
        <button
          onClick={handleSave}
          disabled={saving || questions.length === 0}
          className="flex items-center gap-2 px-8 py-3.5 rounded-full text-sm font-black transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: SP.green, color: '#000' }}
          onMouseEnter={e => { if (!saving && questions.length > 0) { e.currentTarget.style.background='#1ed760'; e.currentTarget.style.transform='scale(1.03)'; }}}
          onMouseLeave={e => { e.currentTarget.style.background=SP.green; e.currentTarget.style.transform='scale(1)'; }}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
};

export default InterviewSettings;
