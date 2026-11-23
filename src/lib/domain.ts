// Domain constants shared by server (Mongoose schemas) and client (forms, labels).
// Plain const arrays instead of TS enums: Node can run them without a build step (scripts/).

export const ITEM_CATEGORIES = [
	'FOOTWEAR',
	'CLOTHING',
	'SLEEP',
	'NAVIGATION',
	'MEDICINE',
	'FOOD',
	'TOOLS',
	'OTHER'
] as const;
export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<ItemCategory, string> = {
	FOOTWEAR: 'Avalynė',
	CLOTHING: 'Apranga',
	SLEEP: 'Nakvynė',
	NAVIGATION: 'Navigacija',
	MEDICINE: 'Pirmoji pagalba',
	FOOD: 'Maistas ir vanduo',
	TOOLS: 'Įrankiai',
	OTHER: 'Kita'
};

export const TEMPERATURES = ['COLD', 'WARM', 'HOT'] as const;
export type Temperature = (typeof TEMPERATURES)[number];

export const TEMPERATURE_LABELS: Record<Temperature, string> = {
	COLD: 'Šaltam orui',
	WARM: 'Šiltam orui',
	HOT: 'Karštam orui'
};

/** An inventory item as the user enters it (UC-2). */
export type ItemInput = {
	name: string;
	category: ItemCategory;
	suitability?: Temperature[];
	attributes?: { name: string; value?: string }[]; // value '' or missing for tag-like attributes
};

/** An inventory item as pages get it. */
export type InventoryItem = Required<Omit<ItemInput, 'attributes'>> & {
	id: string;
	attributes: { name: string; value: string }[];
};

/** Size limits for one item. The form, the schema and the <input> all use these; the inventory also goes into the LLM prompt. */
export const ITEM_LIMITS = { name: 100, attributes: 30, attributeText: 100 } as const;

/** A photo-recognised item below this confidence (%) gets the "Patikrinkite" tag (UC-3). */
export const RECOGNITION_CHECK_BELOW = 70;

export const SEASONS =['WINTER', 'SPRING', 'SUMMER', 'AUTUMN'] as const;
export type Season = (typeof SEASONS)[number];

export const HIKE_DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'] as const;
export type HikeDifficulty = (typeof HIKE_DIFFICULTIES)[number];

/** UI: žemas / vidutinis / aukštas */
export const FITNESS_LEVELS = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type FitnessLevel = (typeof FITNESS_LEVELS)[number];

/** Missing items only. UI: Būtinas / Rekomenduojamas */
export const ITEM_PRIORITIES = ['REQUIRED', 'RECOMMENDED'] as const;
export type ItemPriority = (typeof ITEM_PRIORITIES)[number];

/** Bump when the privacy policy text changes: users must accept the latest version again (UC-12). */
export const PRIVACY_POLICY_VERSION = '2026-11-12';
