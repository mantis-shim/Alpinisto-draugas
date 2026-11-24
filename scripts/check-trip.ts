// Self-check for the trip details rules (UC-6). Run: npm run check:trip
import assert from 'node:assert/strict';
import { isFarDeparture, isIsoDate, readTripForm, seasonOf, todayIso, tripDays } from '#lib/trip.ts';

const today = '2026-11-23';

// Dates (VT-1)
assert.ok(isIsoDate('2026-12-05'));
assert.ok(isIsoDate('2028-02-29'), 'leap day');
for (const bad of ['2026-02-30', '2026-13-01', '2026-1-5', '05.12.2026', '', 'rytoj']) {
	assert.ok(!isIsoDate(bad), `not a date: "${bad}"`);
}
assert.match(todayIso(new Date('2026-11-23T22:30:00Z')), /^2026-11-24$/, 'Vilnius is already on the next day');

// Duration: both ends included (FR-38, VT-8)
assert.equal(tripDays('2026-12-05', '2026-12-05'), 1, 'one-day hike');
assert.equal(tripDays('2026-12-05', '2026-12-07'), 3);
assert.equal(tripDays('2026-12-30', '2027-01-02'), 4, 'over the new year');
assert.equal(tripDays('2027-03-27', '2027-03-29'), 3, 'over the DST change');

// Season from the departure month (FR-38)
assert.equal(seasonOf('2026-12-01'), 'WINTER');
assert.equal(seasonOf('2027-02-28'), 'WINTER');
assert.equal(seasonOf('2027-03-01'), 'SPRING');
assert.equal(seasonOf('2027-05-31'), 'SPRING');
assert.equal(seasonOf('2027-06-01'), 'SUMMER');
assert.equal(seasonOf('2027-08-31'), 'SUMMER');
assert.equal(seasonOf('2027-09-01'), 'AUTUMN');
assert.equal(seasonOf('2027-11-30'), 'AUTUMN');

// Far departure: more than 10 days (FR-37)
assert.ok(!isFarDeparture('2026-11-23', today), 'today');
assert.ok(!isFarDeparture('2026-12-03', today), 'exactly 10 days');
assert.ok(isFarDeparture('2026-12-04', today), '11 days');

// Form rules (FR-35, FR-36, SK-2)
const read = (location: string, departureDate: string, returnDate: string) =>
	readTripForm({ location, departureDate, returnDate }, today);

const good = read('  Triglavas, Slovėnija ', '2026-12-05', '2026-12-07');
assert.ok(good.ok);
assert.equal(good.values.location, 'Triglavas, Slovėnija', 'trimmed');
assert.ok(read('Rysy', today, today).ok, 'a one-day hike today is fine');

const empty = read('  ', '', '').errors;
assert.ok(empty.location && empty.departureDate && empty.returnDate, 'every missing field is marked');
assert.ok(read('x'.repeat(201), '2026-12-05', '2026-12-07').errors.location, 'too long');
assert.ok(read('x'.repeat(200), '2026-12-05', '2026-12-07').ok, '200 characters is fine');
assert.ok(read('Rysy', '2026-11-22', '2026-11-25').errors.departureDate, 'departure in the past');
assert.ok(read('Rysy', '2026-12-05', '2026-12-04').errors.returnDate, 'return before departure');
assert.ok(read('Rysy', '2026-02-30', '2026-12-04').errors.departureDate, 'impossible date');
assert.equal(
	read('Rysy', 'blogai', '2026-12-04').errors.returnDate,
	undefined,
	'no "return before departure" error when the departure itself is invalid'
);

console.log('trip: ok');
