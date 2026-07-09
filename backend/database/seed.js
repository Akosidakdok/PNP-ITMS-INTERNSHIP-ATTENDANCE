require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { initializeDatabase, run, get, all } = require('./db');

async function seed() {
  await initializeDatabase();

  // --- Departments ---
  const departments = [
    ['Information Technology Management Service', 'Handles IT infrastructure and systems management'],
    ['Communications and Electronics Service', 'Manages communications equipment and electronics'],
    ['Human Resource Doctrine Development', 'HR and training policy development'],
    ['Logistics Service', 'Supply and logistics management'],
    ['Finance Service', 'Financial management and budgeting'],
  ];

  for (const [name, desc] of departments) {
    await run('INSERT OR IGNORE INTO departments (name, description) VALUES (?, ?)', [name, desc]);
  }
  console.log('✅ Departments seeded');

  // --- Admin Account ---
  const adminPassword = process.env.ADMIN_DEFAULT_PASSWORD || 'Admin@1234';
  const adminHash = await bcrypt.hash(adminPassword, 12);
  await run('INSERT OR IGNORE INTO users (username, password_hash, role) VALUES (?, ?, ?)', ['admin', adminHash, 'admin']);
  const adminUser = await get('SELECT id FROM users WHERE username = ?', ['admin']);
  console.log('✅ Admin account seeded (username: admin, password:', adminPassword, ')');

  // --- Demo Intern ---
  const internPassword = 'Intern@1234';
  const internHash = await bcrypt.hash(internPassword, 12);
  await run('INSERT OR IGNORE INTO users (username, password_hash, role) VALUES (?, ?, ?)', ['intern_demo', internHash, 'intern']);
  const internUser = await get('SELECT id FROM users WHERE username = ?', ['intern_demo']);
  const firstDept = await get('SELECT id FROM departments LIMIT 1', []);

  await run(`
    INSERT OR IGNORE INTO interns (user_id, full_name, email, phone, school, course, year_level, department_id, required_hours, start_date, end_date, status, student_id, home_address, emergency_name, emergency_relation, emergency_phone)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [internUser.id, 'John Doe', 'john.doe@pup.edu.ph', '09123456789',
      'Polytechnic University of the Philippines', 'BS Information Technology', '4th Year',
      firstDept?.id || 1, 486, '2026-06-01', '2026-09-01', 'active',
      '2023-10045', '123 Anonas St., Santa Mesa, Manila', 'Maria Doe', 'Mother', '09198765432']);
  console.log('✅ Demo intern seeded (username: intern_demo, password:', internPassword, ')');

  // --- Office QR ---
  const existingQR = await get('SELECT id FROM office_qr WHERE is_active = 1', []);
  if (!existingQR) {
    const qrCode = `PNP-ITMS-OFFICE-QR-${uuidv4()}`;
    await run('INSERT INTO office_qr (qr_code, is_active, created_by) VALUES (?, 1, ?)', [qrCode, adminUser.id]);
    console.log('✅ Office QR code generated:', qrCode);
  } else {
    console.log('ℹ️  Office QR already exists');
  }

  console.log('\n🎉 Database seeding complete!');
  console.log('   Admin:   admin / Admin@1234');
  console.log('   Intern:  intern_demo / Intern@1234');
  process.exit(0);
}

seed().catch(err => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});
