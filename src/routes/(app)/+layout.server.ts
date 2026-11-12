import { requireUser } from '#lib/server/auth.ts';
import type { LayoutServerLoad } from './$types';

// Every page in (app) needs a logged-in user. Form actions must call requireUser themselves.
export const load: LayoutServerLoad = ({ locals }) => ({ user: requireUser(locals) });
