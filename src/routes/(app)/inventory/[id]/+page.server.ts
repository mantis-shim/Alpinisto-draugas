import { error, fail, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { requireUser } from '#lib/server/auth.ts';
import { getItem, listAttributeNames, updateItem } from '#lib/server/inventory.ts';
import { readItemForm } from '#lib/validation.ts';
import type { Actions, PageServerLoad } from './$types';

// Someone else's item gets the same 404 as a missing one, so ids can't be probed.
const NOT_FOUND = 'Tokio daikto tavo inventoriuje nėra.';

export const load: PageServerLoad = async ({ locals, params }) => {
	const userId = requireUser(locals).id;
	const [item, attributeNames] = await Promise.all([getItem(userId, params.id), listAttributeNames(userId)]);
	if (!item) error(404, NOT_FOUND);
	return { item, attributeNames };
};

export const actions: Actions = {
	default: async ({ locals, params, request }) => {
		const user = requireUser(locals);
		const { values, errors, input, ok } = readItemForm(await request.formData());
		if (!ok) return fail(400, { values, errors });
		if (!(await updateItem(user.id, params.id, input))) error(404, NOT_FOUND);
		redirect(303, `${resolve('/(app)/inventory')}#item-${params.id}`); // UC-4 step 8: land on the updated item
	}
};
