import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import type { LayoutServerLoad } from './$types';

// Already logged in: go straight to trip planning
export const load: LayoutServerLoad = ({ locals }) => {
	if (locals.user) redirect(303, resolve('/(app)/plan'));
};
