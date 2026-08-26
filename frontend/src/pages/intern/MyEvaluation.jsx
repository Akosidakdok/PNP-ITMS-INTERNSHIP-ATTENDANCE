import { useState, useEffect } from 'react';
import { Award, Star, Lock } from 'lucide-react';
import api from '../../utils/api.js';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

const PROJECT_CRITERIA = [
  { key: 'project_quality', label: 'Quality of Work', weight: 20 },
  { key: 'project_timeliness', label: 'Timeliness / Meeting Deadlines', weight: 10 },
  { key: 'project_problem_solving', label: 'Problem Solving & Creativity', weight: 10 },
  { key: 'project_initiative', label: 'Initiative & Proactivity', weight: 10 },
  { key: 'project_accuracy', label: 'Accuracy & Attention to Detail', weight: 5 },
  { key: 'project_documentation', label: 'Documentation', weight: 5 },
];

const PERFORMANCE_CRITERIA = [
  { key: 'performance_punctuality', label: 'Work Discipline & Punctuality', weight: 10 },
  { key: 'performance_attendance', label: 'Attendance & Reliability', weight: 10 },
  { key: 'performance_teamwork', label: 'Teamwork & Collaboration', weight: 5 },
  { key: 'performance_learning', label: 'Learning & Adaptability', weight: 5 },
  { key: 'performance_initiative', label: 'Initiative & Motivation', weight: 5 },
  { key: 'performance_communication', label: 'Communication Skills', weight: 5 },
];

function getRatingAndLetter(score) {
  const rounded = Math.round(score);
  if (rounded >= 96) return { rating: 'Outstanding', letter: 'A+', interpretation: 'Exceptional performance in both project and duties' };
  if (rounded >= 91) return { rating: 'Very Satisfactory', letter: 'A', interpretation: 'Exceeds expectations' };
  if (rounded >= 86) return { rating: 'Satisfactory', letter: 'B+', interpretation: 'Meets expectations with good performance' };
  if (rounded >= 81) return { rating: 'Fair', letter: 'B', interpretation: 'Acceptable but needs improvement' };
  if (rounded >= 75) return { rating: 'Needs Improvement', letter: 'C', interpretation: 'Minimum passing performance' };
  return { rating: 'Poor', letter: 'F', interpretation: 'Failed / Unsatisfactory' };
}

function parseEvaluationDetails(ev) {
  if (!ev) return null;
  let details = {};
  try {
    details = JSON.parse(ev.comments);
  } catch {
    details = {
      project_scores: {
        project_quality: ev.work_quality || 80,
        project_timeliness: ev.punctuality || 80,
        project_problem_solving: ev.initiative || 80,
        project_initiative: ev.initiative || 80,
        project_accuracy: ev.work_quality || 80,
        project_documentation: ev.work_quality || 80,
      },
      performance_scores: {
        performance_punctuality: ev.punctuality || 80,
        performance_attendance: ev.punctuality || 80,
        performance_teamwork: ev.teamwork || 80,
        performance_learning: ev.teamwork || 80,
        performance_initiative: ev.initiative || 80,
        performance_communication: ev.communication || 80,
      },
      project_comments: ev.comments || '',
      performance_comments: '',
      is_visible: true // Legacy
    };
  }
  return details;
}

export default function MyEvaluation() {
  const [evaluations, setEvaluations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/evaluations')
      .then(r => setEvaluations(r.data.evaluations || []))
      .catch(() => {
        toast.error('Failed to load evaluations.');
      }).finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="space-y-4">
      {Array.from({ length: 2 }).map((_, i) => <div key={i} className="skeleton h-64 rounded-2xl" />)}
    </div>
  );

  // Interns can only see evaluations where is_visible is explicitly true
  const visibleEvaluations = evaluations.filter(ev => {
    const details = parseEvaluationDetails(ev);
    return details && details.is_visible === true;
  });

  return (
    <div className="intern-mobile-page intern-evaluation-page space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-800" style={{ fontFamily: 'Outfit, sans-serif' }}>Performance Evaluations</h1>
        <p className="text-gray-500 text-sm">{visibleEvaluations.length} evaluation(s) visible</p>
      </div>

      {visibleEvaluations.length === 0 ? (
        <div className="card p-12 text-center border border-gray-150">
          <Award className="w-12 h-12 text-gray-350 mx-auto mb-3 opacity-60" />
          <h3 className="font-semibold text-gray-700 mb-1">No evaluations available</h3>
          <p className="text-gray-400 text-sm max-w-md mx-auto">
            Your performance evaluation is either in-progress or currently locked by the administrator. It will appear here once released.
          </p>
        </div>
      ) : (
        visibleEvaluations.map(ev => {
          const details = parseEvaluationDetails(ev);
          const projectScores = details.project_scores || {};
          const performanceScores = details.performance_scores || {};
          
          const projectScore = (
            (Number(projectScores.project_quality || 0) * 0.20) +
            (Number(projectScores.project_timeliness || 0) * 0.10) +
            (Number(projectScores.project_problem_solving || 0) * 0.10) +
            (Number(projectScores.project_initiative || 0) * 0.10) +
            (Number(projectScores.project_accuracy || 0) * 0.05) +
            (Number(projectScores.project_documentation || 0) * 0.05)
          );

          const performanceScore = (
            (Number(performanceScores.performance_punctuality || 0) * 0.10) +
            (Number(performanceScores.performance_attendance || 0) * 0.10) +
            (Number(performanceScores.performance_teamwork || 0) * 0.05) +
            (Number(performanceScores.performance_learning || 0) * 0.05) +
            (Number(performanceScores.performance_initiative || 0) * 0.05) +
            (Number(performanceScores.performance_communication || 0) * 0.05)
          );

          const finalGrade = projectScore + performanceScore;
          const ratingDetails = getRatingAndLetter(finalGrade);

          return (
            <div key={ev.id} className="card p-6 bg-white border border-gray-200 shadow-sm max-w-3xl mx-auto space-y-6">
              
              {/* Official Header */}
              <div className="flex items-center justify-between border-b-2 border-gray-900 pb-4 text-center">
                <img src="/PNP_LOGO.png" alt="PNP Logo" className="w-16 h-16 object-contain" />
                <div className="flex-1 px-4">
                  <p className="text-[10px] font-medium leading-tight">Republic of the Philippines</p>
                  <p className="text-[10px] font-semibold leading-tight">NATIONAL POLICE COMMISSION</p>
                  <p className="text-[11px] font-bold leading-tight">PHILIPPINE NATIONAL POLICE</p>
                  <p className="text-[12px] font-extrabold leading-tight tracking-wider text-blue-900">INFORMATION TECHNOLOGY MANAGEMENT SERVICE</p>
                  <p className="text-[9px] font-medium text-gray-500 leading-none mt-0.5">Camp BGen Rafael T Crame, Quezon City</p>
                </div>
                <img src="/ITMS_LOGO.png" alt="ITMS Logo" className="w-16 h-16 object-contain" />
              </div>

              <h2 className="text-center font-black text-lg text-gray-900 tracking-wide mt-2">OJT Evaluation Form</h2>

              {/* Trainee / Evaluator Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2.5 text-xs border border-gray-300 rounded-xl p-4 bg-gray-50/50">
                <div>
                  <span className="font-bold text-gray-700">Trainee Name:</span>
                  <span className="ml-2 border-b border-gray-400 pb-0.5 inline-block min-w-[200px] font-semibold">{ev.full_name}</span>
                </div>
                <div>
                  <span className="font-bold text-gray-700">Evaluator/Supervisor:</span>
                  <span className="ml-2 border-b border-gray-400 pb-0.5 inline-block min-w-[200px] font-semibold">{ev.evaluator_name}</span>
                </div>
                <div className="md:col-span-2">
                  <span className="font-bold text-gray-700">Evaluation Date:</span>
                  <span className="ml-2 border-b border-gray-400 pb-0.5 inline-block min-w-[200px] font-semibold">
                    {ev.evaluation_date ? format(new Date(ev.evaluation_date), 'MMMM dd, yyyy') : '—'}
                  </span>
                </div>
              </div>

              {/* A. Project Evaluation */}
              <div>
                <h3 className="font-extrabold text-xs text-gray-900 mb-2">A. Project Evaluation (60% of Total Grade)</h3>
                <div className="table-responsive">
                <table className="w-full text-left border border-collapse border-gray-300 text-xs table-card-mobile">
                  <thead>
                    <tr className="bg-gray-100 font-bold border-b border-gray-300 text-gray-700">
                      <th className="p-2.5 border-r border-gray-300 w-[55%]">Competency</th>
                      <th className="p-2.5 border-r border-gray-300 text-center w-[15%]">Weight (%)</th>
                      <th className="p-2.5 border-r border-gray-300 text-center w-[15%]">Percentage Achieved (%)</th>
                      <th className="p-2.5 text-right w-[15%]">Weighted Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-300">
                    {PROJECT_CRITERIA.map(c => {
                      const score = Number(projectScores[c.key] || 0);
                      const weighted = (score * c.weight) / 100;
                      return (
                        <tr key={c.key}>
                          <td className="p-2 border-r border-gray-300 font-medium text-gray-800" data-label="Competency">{c.label}</td>
                          <td className="p-2 border-r border-gray-300 text-center" data-label="Weight">{c.weight}%</td>
                          <td className="p-2 border-r border-gray-300 text-center font-semibold" data-label="Score Achieved">{score}</td>
                          <td className="p-2 text-right font-bold text-gray-900" data-label="Weighted Score">{weighted.toFixed(2)}</td>
                        </tr>
                      );
                    })}
                    <tr className="bg-gray-50/80 font-bold border-t-2 border-gray-400">
                      <td className="p-2.5 border-r border-gray-300 text-gray-900" data-label="Competency">Project Score (Total)</td>
                      <td className="p-2.5 border-r border-gray-300 text-center" data-label="Weight">60%</td>
                      <td className="p-2.5 border-r border-gray-300 text-center" data-label="Score Achieved"></td>
                      <td className="p-2.5 text-right font-black text-blue-900 text-sm" data-label="Weighted Score">{projectScore.toFixed(2)}</td>
                    </tr>
                  </tbody>
                </table>
                </div>
                {details.project_comments && (
                  <div className="mt-2.5 border border-gray-250 rounded-lg p-3 bg-gray-50/50">
                    <p className="text-[10px] font-bold text-gray-500 uppercase mb-0.5">Comments on Project Performance:</p>
                    <p className="text-xs text-gray-700 italic leading-relaxed">{details.project_comments}</p>
                  </div>
                )}
              </div>

              {/* B. Performance Evaluation */}
              <div>
                <h3 className="font-extrabold text-xs text-gray-900 mb-2">B. OJT Performance Evaluation (40% of Total Grade)</h3>
                <div className="table-responsive">
                <table className="w-full text-left border border-collapse border-gray-300 text-xs table-card-mobile">
                  <thead>
                    <tr className="bg-gray-100 font-bold border-b border-gray-300 text-gray-700">
                      <th className="p-2.5 border-r border-gray-300 w-[55%]">Competency</th>
                      <th className="p-2.5 border-r border-gray-300 text-center w-[15%]">Weight (%)</th>
                      <th className="p-2.5 border-r border-gray-300 text-center w-[15%]">Percentage Achieved (%)</th>
                      <th className="p-2.5 text-right w-[15%]">Weighted Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-300">
                    {PERFORMANCE_CRITERIA.map(c => {
                      const score = Number(performanceScores[c.key] || 0);
                      const weighted = (score * c.weight) / 100;
                      return (
                        <tr key={c.key}>
                          <td className="p-2 border-r border-gray-300 font-medium text-gray-800" data-label="Competency">{c.label}</td>
                          <td className="p-2 border-r border-gray-300 text-center" data-label="Weight">{c.weight}%</td>
                          <td className="p-2 border-r border-gray-300 text-center font-semibold" data-label="Score Achieved">{score}</td>
                          <td className="p-2 text-right font-bold text-gray-900" data-label="Weighted Score">{weighted.toFixed(2)}</td>
                        </tr>
                      );
                    })}
                    <tr className="bg-gray-50/80 font-bold border-t-2 border-gray-400">
                      <td className="p-2.5 border-r border-gray-300 text-gray-900" data-label="Competency">Performance Score (Total)</td>
                      <td className="p-2.5 border-r border-gray-300 text-center" data-label="Weight">40%</td>
                      <td className="p-2.5 border-r border-gray-300 text-center" data-label="Score Achieved"></td>
                      <td className="p-2.5 text-right font-black text-blue-900 text-sm" data-label="Weighted Score">{performanceScore.toFixed(2)}</td>
                    </tr>
                  </tbody>
                </table>
                </div>
                {details.performance_comments && (
                  <div className="mt-2.5 border border-gray-250 rounded-lg p-3 bg-gray-50/50">
                    <p className="text-[10px] font-bold text-gray-500 uppercase mb-0.5">Evaluator&apos;s Comments:</p>
                    <p className="text-xs text-gray-700 italic leading-relaxed">{details.performance_comments}</p>
                  </div>
                )}
              </div>

              {/* Final Grade Summary */}
              <div className="border-t border-gray-300 pt-4 flex flex-col items-end gap-1 text-right">
                <div>
                  <span className="font-extrabold text-sm text-gray-900">Final Grade:</span>
                  <span className="ml-2 font-black text-lg text-blue-900 border-b-2 border-double border-gray-900 pb-0.5 px-3">
                    {finalGrade.toFixed(2)}%
                  </span>
                </div>
                <div className="text-xs font-bold text-gray-700 mt-1">
                  Rating: <span className="text-blue-800">{ratingDetails.rating} ({ratingDetails.letter})</span>
                </div>
                <div className="text-[10px] text-gray-500 italic max-w-sm mt-0.5">
                  Interpretation: {ratingDetails.interpretation}
                </div>
              </div>

              {/* Signatures block */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-10 pt-6 border-t border-dashed border-gray-200">
                <div className="text-center space-y-1">
                  <div className="border-b border-gray-600 h-10 w-[80%] mx-auto" />
                  <p className="text-xs font-bold text-gray-700">Evaluator&apos;s Signature</p>
                  <p className="text-[10px] text-gray-400">Date: {ev.evaluation_date ? format(new Date(ev.evaluation_date), 'MM/dd/yyyy') : '—'}</p>
                </div>
                <div className="text-center space-y-1">
                  <div className="border-b border-gray-600 h-10 w-[80%] mx-auto" />
                  <p className="text-xs font-bold text-gray-700">Trainee&apos;s Acknowledgment</p>
                  <p className="text-[10px] text-gray-400">Date: ————————</p>
                </div>
              </div>

            </div>
          );
        })
      )}
    </div>
  );
}
