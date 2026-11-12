// Login sessions: a random token in an httpOnly cookie; the `sessions` collection stores only its SHA-256 hash.
// Deleting the session row logs the user out immediately (logout, account deletion).
import { createHash, randomBytes } from 'node:crypto';
import { redirect, type Cookies } from '@sveltejs/kit';
import type { Types } from 'mongoose';
import { resolve } from '$app/paths';
import { Session, User } from '#lib/server/models.ts';

const COOKIE = 'session';
// ponytail: fixed lifetime, no sliding renewal; add renewal if users get logged out mid-use
const SESSION_DAYS = 30;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export async function startSession(cookies: Cookies, userId: Types.ObjectId) {
	const token = randomBytes(32).toString('base64url');
	const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
	await Session.create({ _id: hashToken(token), userId, expiresAt });
	// secure defaults to true outside dev; httpOnly keeps the token away from page scripts
	cookies.set(COOKIE, token, { path: '/', httpOnly: true, sameSite: 'lax', expires: expiresAt });
}

/** Ends the current session, if any, and removes its cookie. */
export async function endSession(cookies: Cookies) {
	const token = cookies.get(COOKIE);
	if (token) await Session.deleteOne({ _id: hashToken(token) });
	cookies.delete(COOKIE, { path: '/' });
}

/** The logged-in user for this request, or null. The `handle` hook puts it in `locals.user`. */
export async function getSessionUser(cookies: Cookies): Promise<App.Locals['user']> {
	const token = cookies.get(COOKIE);
	if (!token) return null;
	const session = await Session.findById(hashToken(token));
	// MongoDB's TTL cleanup runs only about once a minute, so check expiry here as well
	const user = session && session.expiresAt > new Date() ? await User.findById(session.userId, 'email') : null;
	if (!user) {
		cookies.delete(COOKIE, { path: '/' });
		return null;
	}
	return { id: user.id, email: user.email };
}

/**
 * Returns the logged-in user or redirects to the login page.
 * Call it in every protected form action too: layout guards do not run before actions.
 */
export function requireUser(locals: App.Locals) {
	if (!locals.user) redirect(303, resolve('/(auth)/login'));
	return locals.user;
}
