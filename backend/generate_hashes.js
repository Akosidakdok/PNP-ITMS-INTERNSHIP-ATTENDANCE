import bcrypt from 'bcryptjs';

const password = 'password';
const adminHash = bcrypt.hashSync(password, 10);
const userHash = bcrypt.hashSync(password, 10);
console.log('ADMIN_HASH=' + adminHash);
console.log('USER_HASH=' + userHash);
