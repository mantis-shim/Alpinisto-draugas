import { fail } from '@sveltejs/kit';
import { requireUser } from '#lib/server/auth.ts';
import { createItem, deleteItem, hasItemNamed, listItems } from '#lib/server/inventory.ts';
import { PhotoError, readPhoto } from '#lib/server/photo.ts';
import { mockModel } from '#lib/server/llama_api/recognition-mocks.ts';
import { RecognitionError, llamaModel, recognizeItem } from '#lib/server/llama_api/recognition.ts';
import { readItemForm } from '#lib/validation.ts';
import { LLAMA_API_KEY, LLAMA_URL, RECOGNITION_MOCK } from '$app/env/private';
import type { Actions, PageServerLoad } from './$types';

// The one place that picks the recognition model
const model = RECOGNITION_MOCK
	? mockModel(RECOGNITION_MOCK)
	: llamaModel({ url: LLAMA_URL, apiKey: LLAMA_API_KEY });

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
			// ponytail: no WebP conversion for now, llama-server can't read WebP. JPG/PNG go as uploaded: full size (slower
			// on big phone photos), not rotated, EXIF kept (only to the team's model device). HEIC can't go without a
			// conversion, so it is refused. Converting to JPEG in photo.ts instead of WebP would bring all of that back.
			// const webp = await photoToWebp((await request.formData()).get('photo'));
			const photo = await readPhoto((await request.formData()).get('photo'));
			if (photo.format === 'heic') {
				throw new PhotoError('HEIC nuotraukų kol kas atpažinti negalime. Įkelk JPG arba PNG nuotrauką.');
			}
			const item = await recognizeItem(photo, model);
			if (!item) return { notRecognized: true };
			// It pre-fills the add form for the user to check. Nothing is saved until they press "Išsaugoti" (?/create).
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
