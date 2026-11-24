// Password hashing with Node's built-in scrypt (no native dependency).
// Stored format: scrypt$<log2 N>$<r>$<p>$<salt base64>$<hash base64>, so the cost can be raised later
// without breaking existing hashes. Cost follows OWASP: N = 2^17, r = 8, p = 1.
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

const LOG_N = 17;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;

function derive(password: string, salt: Buffer, keyLength: number, logN: number, r: number, p: number) {
	const options: ScryptOptions = { N: 2 ** logN, r, p, maxmem: 256 * 2 ** logN * r }; // 2x the 128·N·r needed
	return new Promise<Buffer>((resolve, reject) =>
		scrypt(password, salt, keyLength, options, (err, key) => (err ? reject(err) : resolve(key)))
	);
}

export async function hashPassword(password: string): Promise<string> {
	const salt = randomBytes(16);
	const hash = await derive(password, salt, KEY_LENGTH, LOG_N, R, P);
	return ['scrypt', LOG_N, R, P, salt.toString('base64'), hash.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
	const [algorithm, logN, r, p, salt, hash] = stored.split('$');
	if (algorithm !== 'scrypt' || !salt || !hash) return false;
	const expected = Buffer.from(hash, 'base64');
	if (expected.length !== KEY_LENGTH) return false; // an empty key would "match" any password
	try {
		const actual = await derive(password, Buffer.from(salt, 'base64'), KEY_LENGTH, +logN, +r, +p);
		return timingSafeEqual(actual, expected);
	} catch {
		return false; // malformed cost parameters: treat as a wrong password, not a server error
	}
}
