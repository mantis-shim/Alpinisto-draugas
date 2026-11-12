// Input rules shared by forms and server actions. Messages are shown to users as-is (Lithuanian).

const PASSWORD_RULES = [
	{ ok: (pw: string) => pw.length >= 8, message: 'Slaptažodį turi sudaryti bent 8 simboliai.' },
	{ ok: (pw: string) => /\p{Lu}/u.test(pw), message: 'Slaptažodyje turi būti bent viena didžioji raidė.' },
	{ ok: (pw: string) => /\d/.test(pw), message: 'Slaptažodyje turi būti bent vienas skaičius.' }
];

/** Messages for every rule the password breaks; empty when it is valid (FR-2). */
export const passwordProblems = (password: string) =>
	PASSWORD_RULES.filter((rule) => !rule.ok(password)).map((rule) => rule.message);

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

// ponytail: shape check only; a confirmation email is the real test, add it if fake addresses become a problem
export const isEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
