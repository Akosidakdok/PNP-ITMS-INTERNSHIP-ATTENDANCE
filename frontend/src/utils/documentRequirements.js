export const REQUIRED_DOCUMENTS = [
  {
    value: 'Endorsement Letter',
    label: 'Endorsement Letter',
    details: 'Email to messagecenter.itms@gmail.com. Address to PBGEN ROMY I PALGUE, Director, ITMS, Camp BGen Rafael T Crame, Quezon City.',
  },
  {
    value: 'Curriculum Vitae/Resume',
    label: 'Curriculum Vitae/Resume',
    details: 'Upload your current curriculum vitae or resume.',
  },
  {
    value: 'Memorandum of Agreement (MOA)',
    label: 'MOA - 3 Notarized Copies',
    details: 'Three copies, notarized after signing by both the school and the PNP Unit.',
  },
  {
    value: 'Personal Data Sheet (PDS)',
    label: 'PDS - CS Form 212, Revised 2025',
    details: 'Use the current form downloadable from the official Civil Service Commission website.',
  },
  {
    value: 'National Police Clearance',
    label: 'National Police Clearance',
    details: 'Upload a valid National Police Clearance.',
  },
  {
    value: 'Directorate for Intelligence Clearance',
    label: 'Directorate for Intelligence Clearance',
    details: 'Upload the required Directorate for Intelligence Clearance.',
  },
  {
    value: '2x2 and 1x1 Pictures',
    label: 'Two 2x2 and One 1x1 Pictures',
    details: 'Photos must have a white background.',
  },
];

export const UPLOAD_DOCUMENT_TYPES = [
  ...REQUIRED_DOCUMENTS,
  { value: 'Other', label: 'Other supporting document', details: 'Optional supporting document.' },
];
