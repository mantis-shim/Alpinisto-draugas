import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { endSession } from '#lib/server/auth.ts';
import type { RequestHandler } from './$types';

// POST only (a form button), so a link or image on another site can't log the user out
export const POST: RequestHandler = async ({ cookies }) => {
	await endSession(cookies);
	redirect(303, resolve('/(auth)/login'));
};
