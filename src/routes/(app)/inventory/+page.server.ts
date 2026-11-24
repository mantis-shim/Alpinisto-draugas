import { fail } from '@sveltejs/kit';
import { requireUser } from '#lib/server/auth.ts';
import { createItem, deleteItem, hasItemNamed, listItems } from '#lib/server/inventory.ts';
import { PhotoError, photoForModel, readPhoto } from '#lib/server/photo.ts';
import { mockModel } from '#lib/server/llama_api/recognition-mocks.ts';
import {
	MAX_REGENERATIONS,
	PHOTO_PROBLEM_TIPS,
	RecognitionError,
	allowRegeneration,
	forgetRecognition,
	llamaModel,
	recognizeItem,
	takeRegeneration
} from '#lib/server/llama_api/recognition.ts';
import { readItemForm } from '#lib/validation.ts';
import { LLAMA_API_KEY, LLAMA_URL, RECOGNITION_MOCK } from '$app/env/private';
import type { Actions, PageServerLoad } from './$types';

const model = RECOGNITION_MOCK
	? mockModel(RECOGNITION_MOCK)
	: llamaModel({ url: LLAMA_URL, apiKey: LLAMA_API_KEY });

const CANNOT_REGENERATE = `Iš naujo generuoti galima tik ką tik atpažintą nuotrauką, ne daugiau kaip ${MAX_REGENERATIONS} kartus.`;

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

	// UC-3; `regenerate` = "Generuoti iš naujo"
	recognize: async ({ locals, request }) => {
		const user = requireUser(locals);
		try {
			const data = await request.formData();
			const upload = await readPhoto(data.get('photo'));
			const regenerate = data.has('regenerate');
			let regenerationsLeft = null;
			if (regenerate) {
				regenerationsLeft = takeRegeneration(user.id, upload);
				if (regenerationsLeft === null) return fail(409, { photoError: CANNOT_REGENERATE, retry: false });
			} else forgetRecognition(user.id);
			const result = await recognizeItem(await photoForModel(upload), model, regenerate);
			if (typeof result === 'string') return { badPhoto: PHOTO_PROBLEM_TIPS[result] };
			return { recognized: result, regenerationsLeft: regenerationsLeft ?? allowRegeneration(user.id, upload) };
		} catch (error) {
			if (error instanceof PhotoError) return fail(400, { photoError: error.message, retry: false });
			if (error instanceof RecognitionError) {
				console.warn('Item recognition failed:', error.cause);
				return fail(503, { photoError: error.message, retry: true });
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
