import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, FileText, ShieldCheck } from 'lucide-react';
import { LEGAL_DOCUMENTS } from '../../content/legalDocuments.js';

function formatDate(value) {
  return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    .format(new Date(value));
}

export default function LegalDocuments() {
  const [searchParams] = useSearchParams();
  const selectedType = searchParams.get('document');
  const documents = selectedType
    ? LEGAL_DOCUMENTS.filter(document => document.document_type === selectedType)
    : LEGAL_DOCUMENTS;

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <Link to="/login" className="btn btn-ghost btn-sm">
            <ArrowLeft className="h-4 w-4" /> Back to sign in
          </Link>
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">PNP-ITMS Legal Documents</span>
        </div>

        <header className="card mb-6 border border-gray-100 bg-white p-6 shadow-sm sm:p-8">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Terms and Privacy</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">
            Review the current PNP-ITMS Terms and Conditions and Privacy Notice. The active version is shown on each document.
          </p>
        </header>

        <div className="space-y-6">
          {documents.map(document => (
            <article key={document.document_type} id={document.document_type} className="card border border-gray-100 bg-white p-6 shadow-sm sm:p-8">
              <div className="mb-6 flex items-start gap-3 border-b border-gray-100 pb-5">
                <FileText className="mt-1 h-5 w-5 flex-shrink-0 text-blue-600" />
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{document.title}</h2>
                  <p className="mt-1 text-xs font-medium text-gray-500">
                    Version {document.version} · Effective {formatDate(document.effective_at)}
                  </p>
                  <p className="mt-3 text-sm leading-6 text-gray-600">{document.summary}</p>
                </div>
              </div>
              <div className="space-y-6">
                {document.sections.map(section => (
                  <section key={section.heading}>
                    <h3 className="text-sm font-bold uppercase tracking-wide text-gray-800">{section.heading}</h3>
                    {section.paragraphs?.map(paragraph => (
                      <p key={paragraph} className="mt-2 text-sm leading-6 text-gray-600">{paragraph}</p>
                    ))}
                    {section.items && (
                      <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-6 text-gray-600">
                        {section.items.map(item => <li key={item}>{item}</li>)}
                      </ul>
                    )}
                  </section>
                ))}
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
