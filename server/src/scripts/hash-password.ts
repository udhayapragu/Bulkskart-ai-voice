import { hashPassword } from '../auth/password.js';

const password = process.argv[2];
if (!password || password.length < 12) {
  console.error('Usage: npm run hash-password -- "<password of at least 12 characters>"');
  process.exit(1);
}
console.log(await hashPassword(password));
