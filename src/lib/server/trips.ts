// Trip details (UC-6). A user has at most one open trip: one whose recommendations aren't generated yet (no `plan`).
// Trips with a plan belong to the trip history (UC-11) and are never changed here.
import { seasonOf, type TripInput } from '#lib/trip.ts';
import { Hike } from '#lib/server/models.ts';

const openTrip = (userId: string) => ({ userId, plan: { $exists: false } });

// Calendar dates are stored as UTC midnight (CLAUDE.md "Data model").
const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const toIso = (date: Date) => date.toISOString().slice(0, 10);

/** The user's open trip as form values, or null. */
export async function getOpenTrip(userId: string): Promise<TripInput | null> {
	const hike = await Hike.findOne(openTrip(userId)).sort({ createdAt: -1 }).lean();
	return hike
		? { location: hike.location, departureDate: toIso(hike.departureDate), returnDate: toIso(hike.returnDate) }
		: null;
}

/** Saves the trip: updates the open trip if there is one (UC-6 7a), otherwise starts a new one. */
export async function saveOpenTrip(userId: string, trip: TripInput) {
	await Hike.findOneAndUpdate(
		openTrip(userId),
		{
			userId,
			location: trip.location,
			departureDate: toDate(trip.departureDate),
			returnDate: toDate(trip.returnDate),
			season: seasonOf(trip.departureDate)
		},
		{ upsert: true, sort: { createdAt: -1 }, runValidators: true }
	);
}
