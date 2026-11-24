import { error, fail } from '@sveltejs/kit';
import { requireUser } from '#lib/server/auth.ts';
import { deleteHikeForUser, listHikesForUser } from '#lib/server/history.ts';
import type { Actions, PageServerLoad } from './$types';

const NOT_FOUND = 'Tokios kelionės nerasta.';

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireUser(locals);
	const hikes = await listHikesForUser(user.id);
	return { hikes };
};

export const actions: Actions = {
	delete: async ({ locals, request }) => {
		const user = requireUser(locals);
		const data = await request.formData();
		const hikeId = String(data.get('hikeId') ?? '').trim();

		if (!hikeId) {
			return fail(400, { deleteError: 'Nepavyko nustatyti kelionės. Bandyk dar kartą.' });
		}

		const deleted = await deleteHikeForUser(user.id, hikeId);
		if (!deleted) {
			error(404, NOT_FOUND);
		}

		return { deletedId: hikeId };
	}
};