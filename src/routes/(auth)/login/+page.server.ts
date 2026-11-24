import { fail, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { endSession, startSession } from '#lib/server/auth.ts';
import { User } from '#lib/server/models.ts';
import { hashPassword, verifyPassword } from '#lib/server/password.ts';
import { normalizeEmail } from '#lib/validation.ts';
import type { Actions } from './$types';

// Unknown emails are checked against this hash, so both failures take the same time (no account probing).
const dummyHash = hashPassword('no-such-account');

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const data = await request.formData();
		const email = normalizeEmail(String(data.get('email') ?? ''));
		const password = String(data.get('password') ?? '');

		const user = await User.findOne({ email }, 'passwordHash');
		const valid = await verifyPassword(password, user?.passwordHash ?? (await dummyHash));
		// FR-5: one message, never saying whether the email or the password was wrong
		if (!user || !valid) return fail(400, { email, invalid: true });

		await endSession(cookies); // drop any older session in this browser
		await startSession(cookies, user._id);
		redirect(303, resolve('/(app)/plan'));
	}
};
