import { fail } from '@sveltejs/kit';
import { requireUser } from '#lib/server/auth.ts';
import { createItem, deleteItem, hasItemNamed, listItems } from '#lib/server/inventory.ts';
import { PhotoError, photoToWebp } from '#lib/server/photo.ts';
import { MOCK_RECOGNITION, RecognitionError, recognizeItem } from '#lib/server/recognition.ts';
import { readItemForm } from '#lib/validation.ts';
import { dev } from '$app/env';
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
			// no LLAMA_URL in dev: a canned item, so the review below can be tried without the model device
			const item =
				dev && !LLAMA_URL ? MOCK_RECOGNITION : await recognizeItem(webp, { url: LLAMA_URL, apiKey: LLAMA_API_KEY });
			if (!item) return { notRecognized: true };
			// The page reviews it (FR-21–23). Nothing is saved until the user confirms; ?/create saves it.
			return { recognized: item };
		} catch (error) {
			if (error instanceof PhotoError) return fail(400, { photoError: error.message, retry: false }); // pick another
			if (error instanceof RecognitionError) {
				console.warn('Item recognition failed:', error.cause);
				return fail(503, { photoError: error.message, retry: true }); // same photo may work next time
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
