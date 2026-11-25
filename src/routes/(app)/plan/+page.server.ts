import { fail, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { GEMINI_API_KEY, GEMINI_MODEL, RECOMMENDATIONS_MOCK } from '$app/env/private';
import { GenerationError, generateRecommendations, generationNotes } from '#lib/server/gemini/recommendations.ts';
import { requireUser } from '#lib/server/auth.ts';
import { getOpenTrip, saveOpenTrip } from '#lib/server/trips.ts';
import { readTripForm, todayIso, tripSummary } from '#lib/trip.ts';
import type { Actions, PageServerLoad } from './$types';

// UC-6: the open trip's summary, or an empty form when there is none. UC-7: what to warn about before generating.
export const load: PageServerLoad = async ({ locals }) => {
	const { id } = requireUser(locals);
	const today = todayIso();
	const trip = await getOpenTrip(id);
	return { today, trip: trip && tripSummary(trip, today), notes: trip && (await generationNotes(id)) };
};

export const actions: Actions = {
	// UC-6 steps 3–7: check the trip (FR-35, FR-36), save it; the page then shows the summary.
	save: async ({ locals, request }) => {
		const { id } = requireUser(locals);
		const data = await request.formData();
		const { values, errors, ok } = readTripForm(
			{
				location: String(data.get('location') ?? ''),
				departureDate: String(data.get('departureDate') ?? ''),
				returnDate: String(data.get('returnDate') ?? '')
			},
			todayIso()
		);
		if (!ok) return fail(400, { values, errors });

		await saveOpenTrip(id, values);
		return { saved: true };
	},

	// UC-7: one Gemini request for the open trip, saved as its plan; then UC-8 shows it.
	generate: async ({ locals }) => {
		const { id } = requireUser(locals);
		let hikeId;
		try {
			hikeId = await generateRecommendations(id, { apiKey: GEMINI_API_KEY, model: GEMINI_MODEL, mock: RECOMMENDATIONS_MOCK });
		} catch (error) {
			if (!(error instanceof GenerationError)) throw error;
			if (error.cause) console.warn('Recommendation generation failed:', error.cause);
			return fail(error.retry ? 503 : 400, { generateError: error.message, retry: error.retry });
		}
		redirect(303, resolve('/(app)/recommendations/[id]', { id: hikeId }));
	}
};
