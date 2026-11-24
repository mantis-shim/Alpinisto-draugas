import { fail } from '@sveltejs/kit';
import { requireUser } from '#lib/server/auth.ts';
import { getOpenTrip, saveOpenTrip } from '#lib/server/trips.ts';
import { readTripForm, todayIso, tripSummary } from '#lib/trip.ts';
import type { Actions, PageServerLoad } from './$types';

// UC-6: the open trip's summary, or an empty form when there is none.
export const load: PageServerLoad = async ({ locals }) => {
	const today = todayIso();
	const trip = await getOpenTrip(requireUser(locals).id);
	return { today, trip: trip && tripSummary(trip, today) };
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
	}
};
