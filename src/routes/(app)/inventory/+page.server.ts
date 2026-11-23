import { fail } from '@sveltejs/kit';
import { requireUser } from '#lib/server/auth.ts';
import { createItem, deleteItem, hasItemNamed, listItems } from '#lib/server/inventory.ts';
import { PhotoError, photoToWebp } from '#lib/server/photo.ts';
import { RecognitionError, recognizeItem } from '#lib/server/recognition.ts';
import { itemFormValues, readItemForm } from '#lib/validation.ts';
import { LLAMA_API_KEY, LLAMA_URL } from '$app/env/private';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => ({ items: await listItems(requireUser(locals).id) });

export const actions: Actions = {
	// UC-2: add an item by hand
	create: async ({ locals, request }) => {
		const user = requireUser(locals);
		const data = await request.formData();
		const { values, errors, input, ok } = readItemForm(data);
		if (!ok) return fail(400, { values, errors, duplicate: false }); // same shape as below for the page's types
		// 5b: same name already in the inventory -> warn; "Išsaugoti vis tiek" sends duplicateOk
		if (!data.has('duplicateOk') && (await hasItemNamed(user.id, input.name))) {
			return fail(409, { values, errors, duplicate: true });
		}
		const item = await createItem(user.id, input);
		return { created: item.name };
	},

	// UC-3: recognise an item from a photo
	recognize: async ({ locals, request }) => {
		requireUser(locals);
		try {
			const webp = await photoToWebp((await request.formData()).get('photo'));
			const item = await recognizeItem(webp, { url: LLAMA_URL, apiKey: LLAMA_API_KEY });
			if (!item) return { notRecognized: true };
			// ponytail: the add form comes back prefilled for review; nothing is saved until "Išsaugoti".
			// A per-attribute confirm/reject view and "Patvirtinti visus" (FR-21–23) are still to do.
			const { confidence, ...fields } = item;
			return { values: itemFormValues({ id: '', suitability: [], ...fields }), confidence };
		} catch (error) {
			if (error instanceof PhotoError) return fail(400, { photoError: error.message });
			if (error instanceof RecognitionError) {
				console.warn('Item recognition failed:', error.cause);
				return fail(503, { photoError: error.message });
			}
			throw error;
		}
	},

	delete: async ({ locals, request }) => {
		const user = requireUser(locals);
		const id = String((await request.formData()).get('id') ?? '');
		// someone else's item looks exactly like a missing one
		if (!(await deleteItem(user.id, id))) return fail(404, { missing: true });
		return { deleted: true };
	}
};
