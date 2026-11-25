import { error, fail } from '@sveltejs/kit';
import { requireUser } from '#lib/server/auth.ts';
import { getTripRecommendations, markItemPurchased } from '#lib/server/recommendations.ts';
import type { Actions, PageServerLoad } from './$types';

const NOT_FOUND = 'Tokios kelionės nerasta.';

export const load: PageServerLoad = async ({ locals, params }) => {
	const user = requireUser(locals);
	const trip = await getTripRecommendations(user.id, params.id);
	if (!trip) error(404, NOT_FOUND);
	return { trip };
};

export const actions: Actions = {
	purchase: async ({ locals, params, request }) => {
		const user = requireUser(locals);
		const data = await request.formData();
		const itemId = String(data.get('itemId') ?? '').trim();

		if (!itemId) {
			return fail(400, { purchaseError: 'Nepavyko nustatyti daikto. Bandyk dar kartą.' });
		}

		const result = await markItemPurchased(user.id, params.id, itemId);
		if (!result.ok) {
			if (result.reason === 'not_found') error(404, NOT_FOUND);
			if (result.reason === 'already_purchased') {
				return fail(400, { purchaseError: 'Šis daiktas jau pažymėtas kaip įsigytas.' });
			}
			return fail(400, { purchaseError: 'Šis daiktas jau yra inventoriuje.' });
		}

		return {
			purchasedItemName: result.itemName,
			addedToInventory: result.addedToInventory
		};
	}
};