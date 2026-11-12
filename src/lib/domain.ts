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

export const TEMPERATURES = ['COLD', 'WARM', 'HOT'] as const;
export type Temperature = (typeof TEMPERATURES)[number];

export const SEASONS = ['WINTER', 'SPRING', 'SUMMER', 'AUTUMN'] as const;
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
