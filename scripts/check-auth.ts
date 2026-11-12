// Self-check for password hashing and the registration rules. Run: npm run check:auth
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '#lib/server/password.ts';
import { isEmail, normalizeEmail, passwordProblems } from '#lib/validation.ts';

// Hashing
const hash = await hashPassword('Slaptas123');
assert.ok(await verifyPassword('Slaptas123', hash), 'correct password is accepted');
assert.ok(!(await verifyPassword('slaptas123', hash)), 'wrong password is rejected');
assert.notEqual(hash, await hashPassword('Slaptas123'), 'every hash gets a new salt');

const key64 = 'A'.repeat(86) + '=='; // valid-length key, so the bad cost parameter reaches scrypt
for (const broken of ['', 'garbage', 'scrypt$17$8$1$c2FsdA==$', `scrypt$x$8$1$c2FsdA==$${key64}`]) {
	assert.ok(!(await verifyPassword('Slaptas123', broken)), `malformed hash is rejected: "${broken}"`);
}

// Password rules (FR-2): every broken rule is reported
assert.deepEqual(passwordProblems('Slaptas123'), []);
assert.deepEqual(passwordProblems('Ąžuolas1'), [], 'Lithuanian capitals count');
assert.equal(passwordProblems('Trump1').length, 1, 'too short');
assert.equal(passwordProblems('slaptas123').length, 1, 'no capital');
assert.equal(passwordProblems('Slaptažodis').length, 1, 'no digit');
assert.equal(passwordProblems('').length, 3, 'empty breaks all three');

// Email
assert.equal(normalizeEmail('  Vardas@Pastas.LT '), 'vardas@pastas.lt');
assert.ok(isEmail('vardas@pastas.lt'));
for (const bad of ['', 'vardas', 'vardas@pastas', 'var das@pastas.lt', '@pastas.lt']) {
	assert.ok(!isEmail(bad), `not an email: "${bad}"`);
}

console.log('auth: ok');
