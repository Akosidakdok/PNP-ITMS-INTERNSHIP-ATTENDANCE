import { useState, useEffect } from 'react';
import { Award, Star, TrendingUp } from 'lucide-react';
import api from '../../utils/api.js';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

const CRITERIA = [
  { key: 'work_quality', label: 'Work Quality' },
  { key: 'punctuality', label: 'Punctuality' },
  { key: 'teamwork', label: 'Teamwork' },
  { key: 'communication', label: 'Communication' },
  { key: 'initiative', label: 'Initiative' },
];

function RadialScore({ score, label, size = 80 }) {
  const r = (size / 2) - 8;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 90 ? '#22c55e' : score >= 70 ? '#3b82f6' : score >= 60 ? '#eab308' : '#ef4444';

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={6} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={6}
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
        <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central"
          style={{ transform: 'rotate(90deg)', transformOrigin: 'center', fontSize: 14, fontWeight: 700, fill: '#1e293b' }}>
          {score}
        </text>
      </svg>
      <p className="text-xs text-gray-500 text-center">{label}</p>
    </div>
  );
}

export default function MyEvaluation() {
  const [evaluations, setEvaluations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/evaluations')
      .then(r => setEvaluations(r.data.evaluations))
      .catch(() => {
        toast.error('Failed to load evaluations.');
      }).finally(() => setLoading(false));
  }, []);

  const ratingBadge = { 'Outstanding': 'badge-approved', 'Very Satisfactory': 'badge-accepted', 'Satisfactory': 'badge-active', 'Fair': 'badge-pending', 'Needs Improvement': 'badge-rejected' };

  if (loading) return (
    <div className="space-y-4">
      {Array.from({ length: 2 }).map((_, i) => <div key={i} className="skeleton h-64 rounded-2xl" />)}
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-gray-800" style={{ fontFamily: 'Outfit, sans-serif' }}>Performance Evaluations</h1>
        <p className="text-gray-500 text-sm">{evaluations.length} evaluation(s) on record</p>
      </div>

      {evaluations.length === 0 ? (
        <div className="card p-12 text-center">
          <Award className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h3 className="font-semibold text-gray-600 mb-1">No evaluations yet</h3>
          <p className="text-gray-400 text-sm">Your performance evaluation will appear here once submitted by the administrator.</p>
        </div>
      ) : (
        evaluations.map(ev => (
          <div key={ev.id} className="card p-6 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-yellow-50">
                  <Star className="w-5 h-5 text-yellow-500" />
                </div>
                <div>
                  <h2 className="font-bold text-gray-800">Performance Evaluation</h2>
                  <p className="text-xs text-gray-400">{format(new Date(ev.evaluation_date), 'MMMM dd, yyyy')} &middot; by {ev.evaluator_name}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-blue-700">{Number(ev.overall_score).toFixed(1)}</p>
                <span className={`badge ${ratingBadge[ev.overall_rating] || 'badge-pending'}`}>{ev.overall_rating}</span>
              </div>
            </div>

            {/* Score Radials */}
            <div className="flex flex-wrap justify-center gap-6 py-4 bg-gray-50 rounded-2xl mb-5">
              {CRITERIA.map(c => (
                <RadialScore key={c.key} score={Math.round(ev[c.key])} label={c.label} />
              ))}
            </div>

            {/* Overall Bar */}
            <div className="mb-4">
              <div className="flex justify-between text-sm mb-1">
                <span className="font-medium text-gray-700">Overall Score</span>
                <span className="font-bold text-blue-600">{Number(ev.overall_score).toFixed(1)} / 100</span>
              </div>
              <div className="progress-bar h-3">
                <div className="progress-fill" style={{ width: `${ev.overall_score}%` }} />
              </div>
            </div>

            {/* Comments */}
            {ev.comments && (
              <div className="p-4 bg-blue-50 rounded-xl">
                <p className="text-xs font-semibold text-blue-700 mb-1">Administrator Comments:</p>
                <p className="text-sm text-blue-800">{ev.comments}</p>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
