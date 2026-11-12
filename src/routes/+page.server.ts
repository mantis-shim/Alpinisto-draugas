import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import type { PageServerLoad } from './$types';

// The landing page is for visitors; logged-in users start at trip planning
export const load: PageServerLoad = ({ locals }) => {
	if (locals.user) redirect(303, resolve('/(app)/plan'));
};
