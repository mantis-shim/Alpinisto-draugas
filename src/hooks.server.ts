import type { Handle, ServerInit } from '@sveltejs/kit/hooks';
import { getSessionUser } from '#lib/server/auth.ts';
import { connectDb } from '#lib/server/db.ts';

export const init: ServerInit = connectDb;

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.user = await getSessionUser(event.cookies);
	return resolve(event);
};
