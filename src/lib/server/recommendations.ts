// UC-8: load stored recommendations for a trip and mark missing items as bought ("Įsigyta").
// Never regenerates recommendations; every query is scoped by userId.
import { isObjectIdOrHexString, Types } from 'mongoose';
import type { HikeDifficulty, ItemCategory, ItemPriority } from '#lib/domain.ts';
import { Hike, Item } from '#lib/server/models.ts';

export type RecommendationItemView = {
	id: string;
	name: string;
	category: ItemCategory;
	explanation: string;
	owned: boolean;
	priority?: ItemPriority;
	purchased: boolean;
};

export type TripRecommendationsView = {
	hikeId: string;
	location: string;
	departureDate: string;
	returnDate: string;
	hasPlan: boolean;
	recommendations: {
		difficulty: HikeDifficulty;
		feasibility: string;
		fitnessComparison: string;
		weather: string;
		clothing: string;
		locationDescription?: string;
		generatedAt: string;
		takeFromInventory: RecommendationItemView[];
		toBuy: RecommendationItemView[];
	} | null;
};

type RawRecommendedItem = {
	_id?: { toString(): string };
	name?: string;
	category?: ItemCategory;
	explanation?: string;
	owned?: boolean;
	priority?: ItemPriority;
	purchased?: boolean;
};

type RawHike = {
	_id: { toString(): string };
	location: string;
	departureDate: Date;
	returnDate: Date;
	plan?: {
		recommendations?: {
			difficulty: HikeDifficulty;
			feasibility: string;
			fitnessComparison: string;
			weather: string;
			clothing: string;
			locationDescription?: string;
			generatedAt: Date | string;
			items?: RawRecommendedItem[];
		};
	};
};

const toIsoDate = (value: Date | string) => new Date(value).toISOString().slice(0, 10);

const toIsoTimestamp = (value: Date | string) => new Date(value).toISOString();

const mapItem = (item: RawRecommendedItem, index: number): RecommendationItemView => ({
	id: item._id?.toString() ?? String(index),
	name: item.name ?? '',
	category: item.category ?? 'OTHER',
	explanation: item.explanation ?? '',
	owned: Boolean(item.owned),
	priority: item.priority,
	purchased: Boolean(item.purchased)
});

/** Loads a user's hike and its saved recommendations without calling any AI. Returns null if not found. */
export async function getTripRecommendations(userId: string, hikeId: string): Promise<TripRecommendationsView | null> {
	if (!isObjectIdOrHexString(userId) || !isObjectIdOrHexString(hikeId)) return null;

	const hike = await Hike.findOne({ _id: hikeId, userId }).lean<RawHike | null>();
	if (!hike) return null;

	const rawRecs = hike.plan?.recommendations;
	if (!rawRecs) {
		return {
			hikeId: hike._id.toString(),
			location: hike.location,
			departureDate: toIsoDate(hike.departureDate),
			returnDate: toIsoDate(hike.returnDate),
			hasPlan: false,
			recommendations: null
		};
	}

	const mappedItems = (rawRecs.items ?? []).map(mapItem);
	const takeFromInventory = mappedItems.filter((item) => item.owned);
	const toBuy = mappedItems.filter((item) => !item.owned);

	const description = rawRecs.locationDescription?.trim();

	return {
		hikeId: hike._id.toString(),
		location: hike.location,
		departureDate: toIsoDate(hike.departureDate),
		returnDate: toIsoDate(hike.returnDate),
		hasPlan: true,
		recommendations: {
			difficulty: rawRecs.difficulty,
			feasibility: rawRecs.feasibility,
			fitnessComparison: rawRecs.fitnessComparison,
			weather: rawRecs.weather,
			clothing: rawRecs.clothing,
			...(description ? { locationDescription: description } : {}),
			generatedAt: toIsoTimestamp(rawRecs.generatedAt),
			takeFromInventory,
			toBuy
		}
	};
}

export type PurchaseResult =
	| { ok: true; itemName: string; addedToInventory: boolean }
	| { ok: false; reason: 'not_found' | 'already_purchased' | 'owned_item' };

/**
 * Marks a missing recommended item as bought ("Įsigyta") and adds it to the user's inventory.
 * Scoped by userId so another user's trip or item cannot be modified.
 */
export async function markItemPurchased(userId: string, hikeId: string, itemId: string): Promise<PurchaseResult> {
	if (!isObjectIdOrHexString(userId) || !isObjectIdOrHexString(hikeId) || !isObjectIdOrHexString(itemId)) {
		return { ok: false, reason: 'not_found' };
	}

	const hike = await Hike.findOne({
		_id: hikeId,
		userId,
		'plan.recommendations.items._id': itemId
	}).lean<RawHike | null>();

	if (!hike?.plan?.recommendations?.items) {
		return { ok: false, reason: 'not_found' };
	}

	const target = hike.plan.recommendations.items.find((entry) => entry._id?.toString() === itemId);
	if (!target || !target.name || !target.category) {
		return { ok: false, reason: 'not_found' };
	}

	if (target.owned) {
		return { ok: false, reason: 'owned_item' };
	}

	if (target.purchased) {
		return { ok: false, reason: 'already_purchased' };
	}

	const updated = await Hike.updateOne(
		{
			_id: hikeId,
			userId,
			'plan.recommendations.items': {
				$elemMatch: { _id: new Types.ObjectId(itemId), owned: false, purchased: { $ne: true } }
			}
		},
		{
			$set: { 'plan.recommendations.items.$.purchased': true }
		}
	);

	if (updated.modifiedCount !== 1) {
		return { ok: false, reason: 'already_purchased' };
	}

	await Item.create({
		userId: new Types.ObjectId(userId),
		name: target.name,
		category: target.category,
		suitability: [],
		attributes: []
	});

	return { ok: true, itemName: target.name, addedToInventory: true };
}