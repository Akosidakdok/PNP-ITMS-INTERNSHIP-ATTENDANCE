const fs = require('fs');
let content = fs.readFileSync('backend/src/data.js', 'utf8');

// Replace long select strings
content = content.replace(/id, username, full_name, email, role, school, school_id/g, 'id, username, full_name, first_name, middle_name, last_name, name_suffix, email, role, school, school_id');
content = content.replace(/id, username, full_name, email, role, school, course/g, 'id, username, full_name, first_name, middle_name, last_name, name_suffix, email, role, school, course');
content = content.replace(/id, username, full_name, email, role, department_id/g, 'id, username, full_name, first_name, middle_name, last_name, name_suffix, email, role, department_id');

// In createIntern
content = content.replace(/const { password, department_id, school_id, \.\.\.rest } = payload;/g, `const { password, department_id, school_id, ...rest } = payload;
  if (rest.first_name || rest.last_name) {
    rest.full_name = [rest.first_name, rest.middle_name, rest.last_name, rest.name_suffix].filter(Boolean).join(' ');
  }`);

// In updateIntern
content = content.replace(/const updates = { \.\.\.rest };/g, `const updates = { ...rest };
  if (rest.first_name !== undefined || rest.last_name !== undefined) {
    const fn = rest.first_name || '';
    const mn = rest.middle_name || '';
    const ln = rest.last_name || '';
    const sn = rest.name_suffix || '';
    if (fn || ln) {
      updates.full_name = [fn, mn, ln, sn].filter(Boolean).join(' ');
    }
  }`);

// In createAccount
content = content.replace(/const { password, department_id, \.\.\.rest } = payload;(?!\n  if \(rest\.first_name)/g, `const { password, department_id, ...rest } = payload;
  if (rest.first_name || rest.last_name) {
    rest.full_name = [rest.first_name, rest.middle_name, rest.last_name, rest.name_suffix].filter(Boolean).join(' ');
  }`);

// In updateAccount
content = content.replace(/const updates = { \.\.\.payload };/g, `const updates = { ...payload };
  if (updates.first_name !== undefined || updates.last_name !== undefined) {
    const fn = updates.first_name || '';
    const mn = updates.middle_name || '';
    const ln = updates.last_name || '';
    const sn = updates.name_suffix || '';
    if (fn || ln) {
      updates.full_name = [fn, mn, ln, sn].filter(Boolean).join(' ');
    }
  }`);

fs.writeFileSync('backend/src/data.js', content);
