// Self-check for password hashing. Run: npm run check:password
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '#lib/server/password.ts';

const hash = await hashPassword('Slaptas123');

assert.ok(await verifyPassword('Slaptas123', hash), 'correct password is accepted');
assert.ok(!(await verifyPassword('slaptas123', hash)), 'wrong password is rejected');
assert.notEqual(hash, await hashPassword('Slaptas123'), 'every hash gets a new salt');

const key64 = 'A'.repeat(86) + '=='; // valid-length key, so the bad cost parameter reaches scrypt
for (const broken of ['', 'garbage', 'scrypt$17$8$1$c2FsdA==$', `scrypt$x$8$1$c2FsdA==$${key64}`]) {
	assert.ok(!(await verifyPassword('Slaptas123', broken)), `malformed hash is rejected: "${broken}"`);
}

console.log('password: ok');
