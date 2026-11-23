// Input rules shared by forms and server actions. Messages are shown to users as-is (Lithuanian).
import {
	ITEM_CATEGORIES,
	TEMPERATURES,
	type InventoryItem,
	type ItemCategory,
	type ItemInput
} from '#lib/domain.ts';

const PASSWORD_RULES = [
	{ ok: (pw: string) => pw.length >= 8, message: 'Slaptažodį turi sudaryti bent 8 simboliai.' },
	{ ok: (pw: string) => /\p{Lu}/u.test(pw), message: 'Slaptažodyje turi būti bent viena didžioji raidė.' },
	{ ok: (pw: string) => /\d/.test(pw), message: 'Slaptažodyje turi būti bent vienas skaičius.' }
];

/** Messages for every rule the password breaks; empty when it is valid (FR-2). */
export const passwordProblems = (password: string) =>
	PASSWORD_RULES.filter((rule) => !rule.ok(password)).map((rule) => rule.message);

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

// ponytail: shape check only; a confirmation email is the real test, add it if fake addresses become a problem
export const isEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

// Inventory item form (UC-2) ----------------------------------------------------------

/** What the item form holds; sent back to the page so a failed submit keeps the user's input. */
export type ItemFormValues = { name: string; category: string; suitability: string[]; attributes: string };

/** "Other attributes" textarea: one per line, "spalva: ruda" or a tag like "neperšlampamas". */
export const parseAttributes = (text: string) =>
	text.split('\n').flatMap((line) => {
		const [name, ...value] = line.split(':'); // only the first ":" separates, so "10:30" survives
		return name.trim() ? [{ name: name.trim(), value: value.join(':').trim() }] : [];
	});

export const itemFormValues = (item: InventoryItem): ItemFormValues => ({
	name: item.name,
	category: item.category,
	suitability: item.suitability,
	attributes: item.attributes.map(({ name, value }) => (value ? `${name}: ${value}` : name)).join('\n')
});

/** Reads a submitted item form. `input` is ready to save when `errors` is empty (FR-14). */
export function readItemForm(data: FormData) {
	const values: ItemFormValues = {
		name: String(data.get('name') ?? '').trim(),
		category: String(data.get('category') ?? ''),
		suitability: data.getAll('suitability').map(String),
		attributes: String(data.get('attributes') ?? '')
	};
	const errors: { name?: string; category?: string } = {};
	if (!values.name) errors.name = 'Įvesk daikto pavadinimą.';
	if (!ITEM_CATEGORIES.includes(values.category as ItemCategory)) errors.category = 'Pasirink kategoriją.';
	const input: ItemInput = {
		name: values.name,
		category: values.category as ItemCategory,
		suitability: TEMPERATURES.filter((t) => values.suitability.includes(t)), // drops anything unknown
		attributes: parseAttributes(values.attributes)
	};
	return { values, errors, input, ok: Object.keys(errors).length === 0 };
}
