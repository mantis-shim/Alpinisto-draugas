// Trip details (UC-6, US-7, US-8, FR-35–38): form rules, duration, season and the far-date warning.
// Shared by the server and the page. Dates are calendar dates as "YYYY-MM-DD" strings (VT-1).
import type { Season } from '#lib/domain.ts';

export const TRIP_LIMITS = { location: 200 } as const;

/** More days than this until departure → "the weather estimate may be inaccurate" (FR-37). Forecasts reach ~7–10 days. */
export const FAR_DEPARTURE_DAYS = 10;

/** "Today" for the date rules. The users are in Lithuania. */
// ponytail: one fixed zone; take it from the browser if the app gets users elsewhere
export const TIME_ZONE = 'Europe/Vilnius';

export const SEASON_LABELS: Record<Season, string> = {
	WINTER: 'Žiema',
	SPRING: 'Pavasaris',
	SUMMER: 'Vasara',
	AUTUMN: 'Ruduo'
};

/** Today's date in TIME_ZONE as "YYYY-MM-DD" (the en-CA locale formats dates that way). */
export const todayIso = (now = new Date()) =>
	new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(now);

const toUtc = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const DAY_MS = 24 * 60 * 60 * 1000;

/** True for a real calendar date written as YYYY-MM-DD ("2026-02-30" is false). */
export function isIsoDate(value: string) {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	return new Date(toUtc(value)).toISOString().slice(0, 10) === value;
}

/** Whole days from `from` to `to`. */
export const daysBetween = (from: string, to: string) => Math.round((toUtc(to) - toUtc(from)) / DAY_MS);

/** Trip length in days, both ends included: a one-day hike is 1 (FR-38, VT-8). */
export const tripDays = (departure: string, returnDate: string) => daysBetween(departure, returnDate) + 1;

/** Season from the departure month: Dec–Feb winter, Mar–May spring, Jun–Aug summer, Sep–Nov autumn (FR-38). */
export function seasonOf(departure: string): Season {
	const month = +departure.slice(5, 7);
	if (month === 12 || month <= 2) return 'WINTER';
	if (month <= 5) return 'SPRING';
	if (month <= 8) return 'SUMMER';
	return 'AUTUMN';
}

/** FR-37: departure more than FAR_DEPARTURE_DAYS away. */
export const isFarDeparture = (departure: string, today: string) =>
	daysBetween(today, departure) > FAR_DEPARTURE_DAYS;

export type TripInput = { location: string; departureDate: string; returnDate: string };
export type TripErrors = Partial<Record<keyof TripInput, string>>;

/** Checks the trip form (FR-35, FR-36, SK-2). `today` is passed in so the rule is testable. */
export function readTripForm(raw: TripInput, today: string) {
	const values: TripInput = {
		location: raw.location.trim(),
		departureDate: raw.departureDate.trim(),
		returnDate: raw.returnDate.trim()
	};
	const { location, departureDate, returnDate } = values;
	const errors: TripErrors = {};

	if (!location) errors.location = 'Įvesk tikslią žygio vietą.';
	else if (location.length > TRIP_LIMITS.location)
		errors.location = `Žygio vieta per ilga: daugiausia ${TRIP_LIMITS.location} simbolių.`;

	if (!departureDate) errors.departureDate = 'Nurodyk išvykimo datą.';
	else if (!isIsoDate(departureDate)) errors.departureDate = 'Įvesk datą formatu MMMM-MM-DD, pvz., 2026-12-05.';
	else if (departureDate < today) errors.departureDate = 'Išvykimo data negali būti ankstesnė už šiandienos datą.';

	if (!returnDate) errors.returnDate = 'Nurodyk grįžimo datą.';
	else if (!isIsoDate(returnDate)) errors.returnDate = 'Įvesk datą formatu MMMM-MM-DD, pvz., 2026-12-07.';
	else if (isIsoDate(departureDate) && returnDate < departureDate)
		errors.returnDate = 'Grįžimo data negali būti ankstesnė už išvykimo datą.';

	return { values, errors, ok: Object.keys(errors).length === 0 };
}

/** What the trip summary shows (UC-6 step 7). */
export type TripSummary = TripInput & { days: number; season: Season; far: boolean };

export const tripSummary = (trip: TripInput, today: string): TripSummary => ({
	...trip,
	days: tripDays(trip.departureDate, trip.returnDate),
	season: seasonOf(trip.departureDate),
	far: isFarDeparture(trip.departureDate, today)
});
