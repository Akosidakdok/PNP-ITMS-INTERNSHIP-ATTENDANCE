const fs = require('fs');

function patchInternManagement() {
  const path = 'frontend/src/pages/admin/InternManagement.jsx';
  let content = fs.readFileSync(path, 'utf8');

  // INIT_FORM
  content = content.replace(
    /full_name: '',/,
    `first_name: '', middle_name: '', last_name: '', name_suffix: '',`
  );

  // generateUsername
  content = content.replace(
    /const generateUsername = \(fullName\) => {[\s\S]*?return `\$\{firstName\}\.\$\{lastName\}`\.replace\(\/\[\^a-z0-9\.\]\/g, ''\);\n};/,
    `const generateUsername = (firstName, lastName) => {
  const cleanFirst = (firstName || '').trim().toLowerCase().split(/\\s+/)[0] || '';
  const cleanLast = (lastName || '').trim().toLowerCase().replace(/\\s+/g, '') || '';
  if (!cleanFirst && !cleanLast) return '';
  return \`\${cleanFirst}.\${cleanLast}\`.replace(/[^a-z0-9.]/g, '');
};`
  );

  // generatePassword
  content = content.replace(
    /const generatePassword = \(fullName, studentId\) => {[\s\S]*?const surname = parts\[parts\.length - 1\]\.toUpperCase\(\)\.replace\(\/\[\^A-Z\]\/g, ''\);/,
    `const generatePassword = (lastName, studentId) => {
  if (!lastName) return '';
  const parts = lastName.trim().split(/\\s+/);
  const surname = parts[parts.length - 1].toUpperCase().replace(/[^A-Z]/g, '');`
  );

  // handleSave Validation
  content = content.replace(
    /if \(!form\.full_name \|\| !form\.full_name\.trim\(\)\) {\s*toast\.error\('Full Name is required'\);\s*return;\s*}/,
    `if (!form.first_name || !form.first_name.trim() || !form.last_name || !form.last_name.trim()) {
      toast.error('First Name and Last Name are required');
      return;
    }`
  );

  // Student ID onChange (uses full_name currently)
  content = content.replace(
    /updated\.password = generatePassword\(f\.full_name, val\);/,
    `updated.password = generatePassword(f.last_name, val);`
  );

  // Form Fields Replace
  const oldFormFields = `          <div className="form-group">
            <label className="form-label text-[11px] text-gray-500 uppercase font-bold tracking-wider">Full Name <span className="text-red-500">*</span></label>
            <input
              className="form-input bg-gray-50/50"
              placeholder="e.g. Juan De La Cruz"
              value={form.full_name}
              onChange={e => {
                const val = e.target.value;
                setForm(f => {
                  const updated = { ...f, full_name: val };
                  if (modal === 'create') {
                    updated.username = generateUsername(val);
                    updated.password = generatePassword(val, f.student_id);
                  }
                  return updated;
                });
              }}
            />
          </div>`;

  const newFormFields = `          <div className="form-group">
            <label className="form-label text-[11px] text-gray-500 uppercase font-bold tracking-wider">First Name <span className="text-red-500">*</span></label>
            <input
              className="form-input bg-gray-50/50"
              placeholder="e.g. Juan"
              value={form.first_name || ''}
              onChange={e => {
                const val = e.target.value;
                setForm(f => {
                  const updated = { ...f, first_name: val };
                  if (modal === 'create') {
                    updated.username = generateUsername(val, f.last_name);
                  }
                  return updated;
                });
              }}
            />
          </div>
          <div className="form-group">
            <label className="form-label text-[11px] text-gray-500 uppercase font-bold tracking-wider">Middle Name</label>
            <input
              className="form-input bg-gray-50/50"
              placeholder="e.g. Santos"
              value={form.middle_name || ''}
              onChange={e => setForm(f => ({ ...f, middle_name: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label className="form-label text-[11px] text-gray-500 uppercase font-bold tracking-wider">Last Name <span className="text-red-500">*</span></label>
            <input
              className="form-input bg-gray-50/50"
              placeholder="e.g. De La Cruz"
              value={form.last_name || ''}
              onChange={e => {
                const val = e.target.value;
                setForm(f => {
                  const updated = { ...f, last_name: val };
                  if (modal === 'create') {
                    updated.username = generateUsername(f.first_name, val);
                    updated.password = generatePassword(val, f.student_id);
                  }
                  return updated;
                });
              }}
            />
          </div>
          <div className="form-group">
            <label className="form-label text-[11px] text-gray-500 uppercase font-bold tracking-wider">Suffix</label>
            <input
              className="form-input bg-gray-50/50"
              placeholder="e.g. Jr., III"
              value={form.name_suffix || ''}
              onChange={e => setForm(f => ({ ...f, name_suffix: e.target.value }))}
            />
          </div>`;

  content = content.replace(oldFormFields, newFormFields);
  fs.writeFileSync(path, content);
}

patchInternManagement();
