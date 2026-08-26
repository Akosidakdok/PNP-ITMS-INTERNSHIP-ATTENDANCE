import { supabase } from '../supabaseClient.js';

export const LEGAL_DOCUMENTS = [
  {
    document_type: 'terms',
    version: '2026.08.26',
    title: 'PNP-ITMS Terms and Conditions',
    effective_at: '2026-08-26T00:00:00.000Z',
  },
  {
    document_type: 'privacy',
    version: '2026.08.26',
    title: 'PNP-ITMS Privacy Notice',
    effective_at: '2026-08-26T00:00:00.000Z',
  },
];

const legalTypes = new Set(LEGAL_DOCUMENTS.map(document => document.document_type));

function legalAcceptanceError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export async function getActiveLegalDocuments() {
  const { data, error } = await supabase
    .from('legal_documents')
    .select('id, document_type, version, title, effective_at, content_hash')
    .eq('is_active', true)
    .order('document_type');

  if (error) throw error;

  const configured = new Map(LEGAL_DOCUMENTS.map(document => [document.document_type, document]));
  return (data || [])
    .filter(document => configured.has(document.document_type))
    .map(document => ({ ...configured.get(document.document_type), ...document }));
}

export async function getLegalAcceptanceStatus(accountId) {
  const activeDocuments = await getActiveLegalDocuments();
  const { data, error } = await supabase
    .from('legal_acceptances')
    .select('document_type, document_version, accepted_at')
    .eq('account_id', accountId);

  if (error) throw error;

  const accepted = new Map((data || []).map(row => [row.document_type, row]));
  const pending = activeDocuments.filter(document => {
    const acceptance = accepted.get(document.document_type);
    return !acceptance || acceptance.document_version !== document.version;
  });

  return {
    required: pending.length > 0,
    pending,
    accepted: activeDocuments
      .filter(document => !pending.some(item => item.document_type === document.document_type))
      .map(document => ({
        document_type: document.document_type,
        version: document.version,
        accepted_at: accepted.get(document.document_type)?.accepted_at || null,
      })),
  };
}

export async function acceptLegalDocuments(accountId, acceptances, requestMeta = {}) {
  if (!Array.isArray(acceptances) || acceptances.length === 0) {
    throw legalAcceptanceError('Acceptance is required for each current legal document');
  }

  const activeDocuments = await getActiveLegalDocuments();
  const requested = new Map(acceptances.map(item => [item?.document_type, item]));

  if (requested.size !== activeDocuments.length || activeDocuments.some(document => {
    const item = requested.get(document.document_type);
    return !item || item.version !== document.version;
  })) {
    throw legalAcceptanceError('The legal documents have changed. Review the current versions and try again.', 409);
  }

  const rows = activeDocuments.map(document => ({
    account_id: accountId,
    legal_document_id: document.id,
    document_type: document.document_type,
    document_version: document.version,
    acceptance_method: 'explicit_checkbox',
    ip_address: requestMeta.ip || null,
    user_agent: requestMeta.userAgent || null,
  }));

  const { data, error } = await supabase
    .from('legal_acceptances')
    .upsert(rows, { onConflict: 'account_id,legal_document_id' })
    .select('document_type, document_version, accepted_at');

  if (error) throw error;
  return data || [];
}

export async function getLegalAcceptanceSummary() {
  const [activeDocuments, accountsResult, acceptancesResult] = await Promise.all([
    getActiveLegalDocuments(),
    supabase
      .from('accounts')
      .select('id, username, full_name, role, status')
      .order('full_name'),
    supabase
      .from('legal_acceptances')
      .select('account_id, document_type, document_version, accepted_at'),
  ]);

  if (accountsResult.error) throw accountsResult.error;
  if (acceptancesResult.error) throw acceptancesResult.error;

  const acceptedByAccount = new Map();
  for (const acceptance of acceptancesResult.data || []) {
    const key = Number(acceptance.account_id);
    if (!acceptedByAccount.has(key)) acceptedByAccount.set(key, []);
    acceptedByAccount.get(key).push(acceptance);
  }

  return (accountsResult.data || []).map(account => {
    const accepted = acceptedByAccount.get(Number(account.id)) || [];
    const pending = activeDocuments.filter(document => !accepted.some(item =>
      item.document_type === document.document_type && item.document_version === document.version
    ));
    return {
      ...account,
      legal_acceptance_required: pending.length > 0,
      pending_documents: pending.map(document => ({
        document_type: document.document_type,
        version: document.version,
      })),
    };
  });
}

export function isLegalRoute(path) {
  return path === '/auth/me' || path === '/legal' || path.startsWith('/legal/');
}

export function isKnownLegalType(type) {
  return legalTypes.has(type);
}
