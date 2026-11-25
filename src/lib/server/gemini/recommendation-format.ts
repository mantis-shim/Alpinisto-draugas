// UC-7: what goes to Gemini and how its answer becomes the `recommendations` document (CLAUDE.md "Data model").
// No SDK and no DB here, so scripts/check-recommendations.ts runs it with plain Node.
import {
	HIKE_DIFFICULTIES,
	ITEM_CATEGORIES,
	ITEM_LIMITS,
	ITEM_PRIORITIES,
	type FitnessLevel,
	type HikeDifficulty,
	type InventoryItem,
	type ItemCategory,
	type ItemPriority,
	type Season
} from '#lib/domain.ts';
import { FITNESS_LEVEL_LABELS } from '#lib/fitness.ts';
import { SEASON_LABELS } from '#lib/trip.ts';

/** Everything the LLM gets (FR-39). Never the email, password or any id of the user. */
export type RecommendationInput = {
	trip: { location: string; departureDate: string; returnDate: string; days: number; season: Season };
	fitnessLevel: FitnessLevel | null; // null: the questionnaire isn't filled (UC-7 2b)
	inventory: InventoryItem[];
};

/** One entry of `plan.recommendations.items`, as Danielius' getTripRecommendations reads it (owned splits the two lists). */
export type RecommendedItem = {
	name: string;
	category: ItemCategory;
	explanation: string;
	owned: boolean;
	inventoryItemId?: string; // owned items only
	priority?: ItemPriority; // missing items only
	purchased: false;
};

export type GeneratedRecommendations = {
	difficulty: HikeDifficulty;
	feasibility: string;
	fitnessComparison: string;
	weather: string;
	clothing: string;
	locationDescription?: string; // left out when the model has no reliable information (FR-45)
	items: RecommendedItem[];
};

export const SYSTEM_PROMPT = `You help beginner mountain hikers prepare for a hike. You get the trip (location, dates, length in days,
season), the hiker's fitness level and the gear they own (their inventory), as JSON.

Write every text value in plain Lithuanian for a beginner, a few sentences each. Explain hiking terms briefly.
Use only the data you were given and what is reliably known about the place. Never invent facts: where the data is not
enough (an unknown or vague location, no fitness level), say so in that field instead of guessing.
This is advice, not a guarantee: never say the hike is certainly safe or certainly unsafe.

Fields:
- locationRecognized: true only if the location is a real place you can identify (a mountain, range, national park,
  region, town or route). false for random letters, a word that is not a place, or a place you cannot identify. When it
  is false, the other text fields may be empty strings and the lists empty: nothing is shown to the hiker.
- difficulty: EASY, MEDIUM or HARD for a typical route at this location.
- feasibility: the route's difficulty, typical distance and elevation gain, and the time it takes, compared with the days
  available (durationDays). If it is not realistic in that time, say so clearly.
- fitnessComparison: compare the difficulty with the hiker's fitness level (žemas / vidutinis / aukštas). If the hike may be
  too hard, warn and name the main reasons. If fitnessLevel is null, say the comparison is limited because the fitness
  questionnaire is not filled in.
- weather: typical temperature, precipitation and wind for this place and these dates. It is an estimate from typical
  conditions, not a forecast: say so.
- clothing: layers for the temperature, waterproof clothing if rain or snow is likely, extra warm and windproof layers for
  cold or strong wind.
- locationDescription: a short description of the landscape and notable natural features. An empty string if you have no
  reliable information about this place.
- takeFromInventory: items from the inventory that are useful on this trip, by their "key", each with a short reason.
- toBuy: items the hike needs that are not in the inventory, each with a category, priority REQUIRED (needed for safety or
  to do the hike at all) or RECOMMENDED, and a short reason. Do not list what the inventory already covers. With an empty
  inventory, list everything the hike needs.

An inventory attribute with an empty value means "yes" (e.g. "neperšlampamas" = waterproof).`;

const text = (description: string) => ({ type: 'string', description });

/** JSON schema for Gemini (config.responseJsonSchema). Every property required, no additional properties. Gemini drops keywords it does not support, so parseRecommendations checks the answer anyway. */
export const RECOMMENDATION_SCHEMA = {
	type: 'object',
	additionalProperties: false,
	required: [
		'locationRecognized',
		'difficulty',
		'feasibility',
		'fitnessComparison',
		'weather',
		'clothing',
		'locationDescription',
		'takeFromInventory',
		'toBuy'
	],
	properties: {
		locationRecognized: { type: 'boolean', description: 'Ar žygio vieta yra tikra, atpažįstama vieta' },
		difficulty: { type: 'string', enum: [...HIKE_DIFFICULTIES] },
		feasibility: text('Įveikiamumas per turimą laiką, lietuviškai'),
		fitnessComparison: text('Sudėtingumo palyginimas su fiziniu pasirengimu, lietuviškai'),
		weather: text('Tipinių oro sąlygų įvertinimas, lietuviškai'),
		clothing: text('Aprangos rekomendacijos, lietuviškai'),
		locationDescription: text('Trumpas vietos aprašymas lietuviškai arba tuščia eilutė'),
		takeFromInventory: {
			type: 'array',
			items: {
				type: 'object',
				additionalProperties: false,
				required: ['key', 'explanation'],
				properties: { key: text('Inventoriaus daikto "key"'), explanation: text('Kodėl jo reikia, lietuviškai') }
			}
		},
		toBuy: {
			type: 'array',
			items: {
				type: 'object',
				additionalProperties: false,
				required: ['name', 'category', 'priority', 'explanation'],
				properties: {
					name: text('Daikto pavadinimas lietuviškai'),
					category: { type: 'string', enum: [...ITEM_CATEGORIES] },
					priority: { type: 'string', enum: [...ITEM_PRIORITIES] },
					explanation: text('Kodėl jo reikia, lietuviškai')
				}
			}
		}
	}
} as const;

/** The user message, plus the inventory by the short keys the model refers to (it never sees database ids). */
export function buildRequest({ trip, fitnessLevel, inventory }: RecommendationInput) {
	const keyed = new Map(inventory.map((item, index) => [`d${index + 1}`, item]));
	const data = {
		trip: {
			location: trip.location,
			departureDate: trip.departureDate,
			returnDate: trip.returnDate,
			durationDays: trip.days,
			season: SEASON_LABELS[trip.season]
		},
		fitnessLevel: fitnessLevel && FITNESS_LEVEL_LABELS[fitnessLevel],
		inventory: [...keyed].map(([key, item]) => ({
			key,
			name: item.name,
			category: item.category,
			suitability: item.suitability,
			attributes: item.attributes
		}))
	};
	return { user: JSON.stringify(data, null, 2), keyed };
}

export class InvalidAnswer extends Error {}
/** The model doesn't recognise the trip location as a real place: nothing is stored, the user corrects the location. */
export class UnknownLocation extends Error {}

const MAX_ITEMS = 40;
const str = (value: unknown, field: string) => {
	if (typeof value !== 'string') throw new InvalidAnswer(`${field} is not a string`);
	return value.trim();
};
const required = (value: unknown, field: string) => {
	const result = str(value, field);
	if (!result) throw new InvalidAnswer(`${field} is empty`);
	return result;
};
const list = (value: unknown, field: string) => {
	if (!Array.isArray(value)) throw new InvalidAnswer(`${field} is not an array`);
	return value.slice(0, MAX_ITEMS) as Record<string, unknown>[];
};
// Compare enum values upper-cased, in case the model changes their case.
const oneOf = <T extends string>(value: unknown, options: readonly T[]) =>
	options.find((option) => option === String(value).toUpperCase());

/** Checks the model's JSON and maps it to the stored shape. Throws InvalidAnswer if it doesn't fit. */
export function parseRecommendations(json: string, keyed: Map<string, InventoryItem>): GeneratedRecommendations {
	let answer: Record<string, unknown>;
	try {
		answer = JSON.parse(json);
	} catch (error) {
		throw new InvalidAnswer('not JSON', { cause: error });
	}
	if (!answer || typeof answer !== 'object') throw new InvalidAnswer('not an object');
	if (typeof answer.locationRecognized !== 'boolean') throw new InvalidAnswer('locationRecognized is not a boolean');
	if (!answer.locationRecognized) throw new UnknownLocation('location not recognised');

	const difficulty = oneOf(answer.difficulty, HIKE_DIFFICULTIES);
	if (!difficulty) throw new InvalidAnswer(`unknown difficulty ${String(answer.difficulty)}`);

	// Owned items keep the inventory's own name and category; unknown or repeated keys are dropped.
	const seen = new Set<string>();
	const owned = list(answer.takeFromInventory, 'takeFromInventory').flatMap((entry): RecommendedItem[] => {
		const key = str(entry.key, 'key');
		const item = keyed.get(key);
		if (!item || seen.has(key)) return [];
		seen.add(key);
		const explanation = required(entry.explanation, 'explanation');
		return [{ name: item.name, category: item.category, explanation, owned: true, inventoryItemId: item.id, purchased: false }];
	});

	const missing = list(answer.toBuy, 'toBuy').flatMap((entry): RecommendedItem[] => {
		const name = str(entry.name, 'name').slice(0, ITEM_LIMITS.name);
		if (!name) return [];
		return [
			{
				name,
				category: oneOf(entry.category, ITEM_CATEGORIES) ?? 'OTHER',
				explanation: required(entry.explanation, 'explanation'),
				owned: false,
				priority: oneOf(entry.priority, ITEM_PRIORITIES) ?? 'RECOMMENDED',
				purchased: false
			}
		];
	});

	const locationDescription = str(answer.locationDescription, 'locationDescription');
	return {
		difficulty,
		feasibility: required(answer.feasibility, 'feasibility'),
		fitnessComparison: required(answer.fitnessComparison, 'fitnessComparison'),
		weather: required(answer.weather, 'weather'),
		clothing: required(answer.clothing, 'clothing'),
		...(locationDescription && { locationDescription }),
		items: [...owned, ...missing]
	};
}

// Mock answers (RECOMMENDATIONS_MOCK in .env): the whole flow without an API key, also used by the self-check.
export const MOCK_SCENARIOS = ['ok', 'unknown-location', 'error', 'refusal'] as const;
export type MockScenario = (typeof MOCK_SCENARIOS)[number];
export const isMockScenario = (value: string): value is MockScenario => (MOCK_SCENARIOS as readonly string[]).includes(value);

const NOTE = '(Bandomasis atsakymas be DI.)';

/** The model's JSON for the "ok" scenario: the first three inventory items to take, two items to buy. */
export function mockAnswer(keyed: Map<string, InventoryItem>, fitnessLevel: FitnessLevel | null) {
	return JSON.stringify({
		locationRecognized: true,
		difficulty: 'MEDIUM',
		feasibility: `Maršrutas vidutinio sudėtingumo, per turimas dienas įveikiamas. ${NOTE}`,
		fitnessComparison: fitnessLevel
			? `Tavo fizinio pasirengimo lygis – ${FITNESS_LEVEL_LABELS[fitnessLevel]}. ${NOTE}`
			: `Fizinio pasirengimo klausimynas neužpildytas, todėl palyginimas ribotas. ${NOTE}`,
		weather: `Tipinės sąlygos: 5–12 °C, galimas lietus ir vėjas. Tai įvertinimas, ne prognozė. ${NOTE}`,
		clothing: `Rinkis sluoksnius: termo apatiniai, flisas ir neperšlampama striukė. ${NOTE}`,
		locationDescription: `Kalnuotas kraštovaizdis su miškais ir uolėtomis viršūnėmis. ${NOTE}`,
		takeFromInventory: [...keyed.keys()].slice(0, 3).map((key) => ({ key, explanation: `Pravers šiame žygyje. ${NOTE}` })),
		toBuy: [
			{ name: 'Vaistinėlė', category: 'MEDICINE', priority: 'REQUIRED', explanation: `Būtina kiekviename žygyje. ${NOTE}` },
			{ name: 'Žygio lazdos', category: 'TOOLS', priority: 'RECOMMENDED', explanation: `Palengvina nusileidimus. ${NOTE}` }
		]
	});
}

/** The model's JSON for the "unknown-location" scenario: it doesn't recognise the place. */
export const mockUnknownLocation = () =>
	JSON.stringify({
		locationRecognized: false,
		difficulty: 'EASY',
		feasibility: '',
		fitnessComparison: '',
		weather: '',
		clothing: '',
		locationDescription: '',
		takeFromInventory: [],
		toBuy: []
	});
