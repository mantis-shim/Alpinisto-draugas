import { fail, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { PRIVACY_POLICY_VERSION } from '#lib/domain.ts';
import { startSession } from '#lib/server/auth.ts';
import { User } from '#lib/server/models.ts';
import { hashPassword } from '#lib/server/password.ts';
import { isEmail, normalizeEmail, passwordProblems } from '#lib/validation.ts';
import type { Actions } from './$types';

type Errors = { email?: string; emailTaken?: boolean; password?: string[]; consent?: string };

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const data = await request.formData();
		const email = normalizeEmail(String(data.get('email') ?? ''));
		const password = String(data.get('password') ?? '');

		const errors: Errors = {};
		if (!isEmail(email)) errors.email = 'Įvesk el. pašto adresą, pvz., vardas@pastas.lt.';
		const problems = passwordProblems(password);
		if (problems.length) errors.password = problems;
		// FR-8: without consent nothing is stored
		if (data.get('consent') !== 'on') errors.consent = 'Be sutikimo paskyros sukurti negalime.';
		if (Object.keys(errors).length) return fail(400, { email, errors });

		const takenErrors: Errors = { emailTaken: true }; // typed as Errors so the page sees one shape
		const taken = fail(400, { email, errors: takenErrors });
		if (await User.exists({ email })) return taken;

		let user;
		try {
			user = await User.create({
				email,
				passwordHash: await hashPassword(password),
				consents: [{ version: PRIVACY_POLICY_VERSION, givenAt: new Date() }] // FR-9
			});
		} catch (e) {
			if ((e as { code?: number }).code === 11000) return taken; // registered in parallel
			throw e;
		}

		await startSession(cookies, user._id);
		redirect(303, resolve('/(app)/plan'));
	}
};
