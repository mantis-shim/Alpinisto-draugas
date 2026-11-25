// UC-11: list a user's hikes from newest to oldest and delete a chosen hike record.
// Every query is scoped by userId; stored plans are never regenerated here.
import { isObjectIdOrHexString } from 'mongoose';
import type { Season } from '#lib/domain.ts';
import { Hike } from '#lib/server/models.ts';
import { seasonOf, tripDays } from '#lib/trip.ts';

export type HikeHistoryItem = {
	id: string;
	location: string;
	departureDate: string;
	returnDate: string;
	days: number;
	season: Season;
	hasPlan: boolean;
	createdAt: string;
};

type RawHikeRow = {
	_id: { toString(): string };
	location: string;
	departureDate: Date | string;
	returnDate: Date | string;
	season?: Season;
	plan?: unknown;
	createdAt?: Date | string;
};

const toIsoDate = (value: Date | string) => new Date(value).toISOString().slice(0, 10);

const toIsoTimestamp = (value: Date | string | undefined) =>
	value ? new Date(value).toISOString() : new Date(0).toISOString();

/** Lists hikes belonging to the user, ordered newest first (createdAt: -1). */
export async function listHikesForUser(userId: string): Promise<HikeHistoryItem[]> {
	if (!isObjectIdOrHexString(userId)) return [];

	const hikes = await Hike.find({ userId }).sort({ createdAt: -1, _id: -1 }).lean<RawHikeRow[]>();

	return hikes.map((hike) => {
		const departureDate = toIsoDate(hike.departureDate);
		const returnDate = toIsoDate(hike.returnDate);

		return {
			id: hike._id.toString(),
			location: hike.location,
			departureDate,
			returnDate,
			days: tripDays(departureDate, returnDate),
			season: hike.season ?? seasonOf(departureDate),
			hasPlan: Boolean(hike.plan),
			createdAt: toIsoTimestamp(hike.createdAt)
		};
	});
}

/** Deletes a single hike owned by the user. Returns true if a document was deleted. */
export async function deleteHikeForUser(userId: string, hikeId: string): Promise<boolean> {
	if (!isObjectIdOrHexString(userId) || !isObjectIdOrHexString(hikeId)) return false;

	const deleted = await Hike.deleteOne({ _id: hikeId, userId });
	return deleted.deletedCount === 1;
}