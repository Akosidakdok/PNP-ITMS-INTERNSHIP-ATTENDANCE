import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, LogOut, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext.jsx';
import { LEGAL_DOCUMENTS } from '../../content/legalDocuments.js';

function formatDate(value) {
  return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    .format(new Date(value));
}

export default function LegalAcceptance() {
  const { user, acceptLegalDocuments, logout } = useAuth();
  const navigate = useNavigate();
  const [checked, setChecked] = useState({ terms: false, privacy: false });
  const [saving, setSaving] = useState(false);

  const canContinue = checked.terms && checked.privacy;

  const handleAccept = async () => {
    if (!canContinue || saving) return;
    setSaving(true);
    try {
      await acceptLegalDocuments(LEGAL_DOCUMENTS.map(document => ({
        document_type: document.document_type,
        version: document.version,
      })));
      toast.success('Legal documents accepted');
      navigate(user?.role === 'admin' || user?.role === 'supervisor' ? '/admin' : '/intern', { replace: true });
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Could not save your acceptance. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDecline = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="legal-modal-overlay">
      <section className="legal-modal" role="dialog" aria-modal="true" aria-labelledby="legal-modal-title">
        <header className="legal-modal__header bg-gradient-to-br from-pnp-950 to-pnp-800 text-white">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-white/10">
            <ShieldCheck className="h-6 w-6 text-blue-200" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-200">PNP-ITMS account setup</p>
          <h1 id="legal-modal-title" className="mt-2 text-2xl font-bold sm:text-3xl">Review and accept the current legal documents</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-blue-100">
            Welcome{user?.full_name ? `, ${user.full_name}` : ''}. Please review both documents before using protected PNP-ITMS features.
          </p>
        </header>

        <div className="legal-modal__body">
          <div className="space-y-6">
          {LEGAL_DOCUMENTS.map(document => (
            <article key={document.document_type} className="card border border-gray-100 bg-white p-6 shadow-sm sm:p-8">
              <div className="mb-5 flex items-start justify-between gap-4 border-b border-gray-100 pb-5">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{document.title}</h2>
                  <p className="mt-1 text-xs font-medium text-gray-500">
                    Version {document.version} · Effective {formatDate(document.effective_at)}
                  </p>
                </div>
                <a
                  href={`/legal?document=${document.document_type}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-semibold text-blue-600 hover:text-blue-800"
                >
                  Open full view
                </a>
              </div>
              <div className="legal-acceptance__document-scroll overflow-y-auto rounded-xl bg-gray-50 p-4 sm:p-5">
                <p className="mb-4 text-sm leading-6 text-gray-600">{document.summary}</p>
                <div className="space-y-4">
                  {document.sections.map(section => (
                    <section key={section.heading}>
                      <h3 className="text-sm font-bold text-gray-800">{section.heading}</h3>
                      {section.paragraphs?.map(paragraph => (
                        <p key={paragraph} className="mt-1 text-sm leading-6 text-gray-600">{paragraph}</p>
                      ))}
                      {section.items && (
                        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-6 text-gray-600">
                          {section.items.map(item => <li key={item}>{item}</li>)}
                        </ul>
                      )}
                    </section>
                  ))}
                </div>
              </div>
              <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 p-4 hover:bg-gray-50">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-blue-700"
                  checked={checked[document.document_type]}
                  onChange={event => setChecked(current => ({ ...current, [document.document_type]: event.target.checked }))}
                />
                <span className="text-sm leading-6 text-gray-700">
                  {document.document_type === 'terms'
                    ? 'I have read and agree to the PNP-ITMS Terms and Conditions.'
                    : 'I have read the PNP-ITMS Privacy Notice and consent to the collection, use, and processing of my personal information for the stated purposes.'}
                </span>
              </label>
            </article>
          ))}
          </div>

          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0" />
              <p>You can decline and sign out, but current acceptance is required to continue using protected PNP-ITMS features.</p>
            </div>
          </div>
        </div>

        <footer className="legal-modal__footer flex flex-col-reverse justify-end gap-3 sm:flex-row">
          <button type="button" className="btn btn-secondary" onClick={handleDecline} disabled={saving}>
            <LogOut className="h-4 w-4" /> Decline and sign out
          </button>
          <button type="button" className="btn btn-primary" onClick={handleAccept} disabled={!canContinue || saving}>
            <CheckCircle2 className="h-4 w-4" /> {saving ? 'Saving acceptance...' : 'Accept and continue'}
          </button>
        </footer>
      </section>
    </div>
  );
}
