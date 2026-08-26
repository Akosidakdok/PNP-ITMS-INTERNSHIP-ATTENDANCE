export const LEGAL_VERSION = '2026.08.26';

export const LEGAL_DOCUMENTS = [
  {
    document_type: 'terms',
    version: LEGAL_VERSION,
    title: 'PNP-ITMS Terms and Conditions',
    effective_at: '2026-08-26T00:00:00.000Z',
    summary: 'Rules for authorized access and responsible use of the PNP-ITMS internship system.',
    sections: [
      {
        heading: '1. Authorized access',
        paragraphs: [
          'PNP-ITMS is an internal system for authorized Philippine National Police personnel, internship coordinators, supervisors, and registered interns. You may use only the account assigned to you and only for official internship-related activities.',
        ],
      },
      {
        heading: '2. Account responsibilities',
        paragraphs: [
          'You are responsible for keeping your password and account credentials confidential. You must promptly report suspected unauthorized access, inaccurate account information, or a lost or compromised credential to the system administrator.',
        ],
      },
      {
        heading: '3. Acceptable use',
        paragraphs: [
          'You agree to submit accurate information, use attendance and document features honestly, and handle information about other users with care. You must not attempt to bypass access controls, impersonate another person, interfere with system operation, upload malicious content, or use records for an unauthorized purpose.',
        ],
      },
      {
        heading: '4. Internship records and Face ID',
        paragraphs: [
          'Attendance scans, documents, projects, evaluations, and Face ID enrollment records must be submitted only for the registered intern and the stated internship purpose. Face verification is an identity-verification control for attendance and does not authorize access to another person’s account or records.',
        ],
      },
      {
        heading: '5. Account status and system availability',
        paragraphs: [
          'Access may be limited, suspended, or terminated when an account is inactive, the user violates these conditions, or continued access creates a security or privacy risk. The system may be unavailable temporarily for maintenance, security response, or service interruptions.',
        ],
      },
      {
        heading: '6. Changes to these conditions',
        paragraphs: [
          'The PNP-ITMS administrators may publish an updated version of these conditions. When a new version takes effect, you must review and accept it before continuing to use protected system features.',
        ],
      },
      {
        heading: '7. Support and concerns',
        paragraphs: [
          'For account, system-use, or security concerns, contact the PNP-ITMS system administrator or your assigned internship coordinator through the official PNP channel.',
        ],
      },
    ],
  },
  {
    document_type: 'privacy',
    version: LEGAL_VERSION,
    title: 'PNP-ITMS Privacy Notice',
    effective_at: '2026-08-26T00:00:00.000Z',
    summary: 'How PNP-ITMS collects, uses, protects, and provides access to personal information.',
    sections: [
      {
        heading: '1. Our commitment',
        paragraphs: [
          'The Philippine National Police Training Service, with the technical support of the Information Technology Management Service, takes the privacy and protection of personal information in PNP-ITMS seriously. This notice explains how information is collected and processed within the system.',
        ],
      },
      {
        heading: '2. Purposes of processing',
        paragraphs: [
          'PNP-ITMS may process personal information to authenticate and verify identity; administer internship placement and training records; record and review attendance; manage documents, projects, and evaluations; communicate with data subjects; provide relevant notices; improve services; maintain system security; and comply with legal or other legitimate organizational requirements.',
        ],
      },
      {
        heading: '3. Personal data collected',
        paragraphs: ['Depending on your role and participation, the system may collect and process:'],
        items: [
          'Account information such as username, name, email address, role, school, course, student ID, year level, and assigned division.',
          'Contact and personal information such as phone number, home address, and emergency-contact details.',
          'Internship information such as start and end dates, required and rendered hours, attendance scans, and approval remarks.',
          'Documents and project information that you or authorized staff upload or maintain in the system.',
          'Evaluation records, calendar-related participation, notifications, and system activity needed to operate the service.',
          'Face enrollment data and verification results used for identity verification, subject to the applicable PNP privacy and security controls.',
        ],
      },
      {
        heading: '4. Protection and retention',
        paragraphs: [
          'Access to records is restricted by account role and authorization rules. Credentials are protected using password hashing, and uploaded files are served through authorized access. Records are retained only for as long as needed for internship administration, security, legal, audit, and archival requirements established by the PNP Training Service and applicable policy.',
        ],
      },
      {
        heading: '5. Rights of the data subject',
        paragraphs: ['Subject to applicable law and policy, data subjects may exercise the following rights:'],
        items: [
          'Right to be informed about the collection and processing of personal data.',
          'Right to object to processing where the legal basis permits an objection.',
          'Right to rectification of inaccurate or incomplete information.',
          'Right to erasure or blocking when legally applicable.',
          'Right to damages for unlawful or unauthorized processing, where applicable.',
          'Right to data portability where applicable.',
          'Right to file a complaint with the appropriate privacy authority.',
        ],
      },
      {
        heading: '6. How to exercise your rights',
        paragraphs: [
          'To exercise a privacy right or ask about your information, contact the PNP-ITMS Privacy or Compliance Officer through the official PNP channel. Requests may require identity verification and may be subject to legal or operational limitations.',
        ],
      },
      {
        heading: '7. Privacy contact and feedback',
        paragraphs: [
          'Privacy concerns, questions, and suggestions about this notice should be directed to the designated PNP-ITMS Privacy or Compliance Officer. The office may publish updated contact details through the official system or PNP communication channels.',
        ],
      },
    ],
  },
];

export function getLegalDocument(type) {
  return LEGAL_DOCUMENTS.find(document => document.document_type === type) || LEGAL_DOCUMENTS[0];
}
