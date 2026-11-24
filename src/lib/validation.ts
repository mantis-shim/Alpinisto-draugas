// Input rules shared by forms and server actions. Messages are shown to users as-is (Lithuanian).
import {
	ITEM_CATEGORIES,
	ITEM_LIMITS,
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
export type ItemFormErrors = { name?: string; category?: string; attributes?: string };

/** "Kiti požymiai": one per line, "spalva: ruda" or a tag like "neperšlampamas". */
export const parseAttributes = (text: string) =>
	text.split('\n').flatMap((line) => {
		const [name, ...value] = line.split(':'); // only the first ":" separates, so "10:30" survives
		return name.trim() ? [{ name: name.trim(), value: value.join(':').trim() }] : [];
	});

/** One attribute as text: "spalva: ruda", or just "neperšlampamas" for a tag. parseAttributes reads it back. */
export const attributeText = ({ name, value }: { name: string; value: string }) => (value ? `${name}: ${value}` : name);

const TAG_HUES = [75, 200, 150, 290, 245, 335]; // amber, blue, green, violet, indigo, pink: no red (danger only)

/** Attributes for display: values of the same name side by side in one colour ("spalva: ruda", "spalva: juoda"), a
 *  different colour per name, then the tags without a value ("neperšlampamas"), uncoloured. Order is kept otherwise. */
export function groupAttributes<T extends { name: string; value: string }>(attributes: T[]) {
	const names = [...new Set(attributes.filter((a) => a.value).map((a) => fold(a.name)))];
	const group = (a: T) => (a.value ? names.indexOf(fold(a.name)) : names.length);
	return attributes
		.toSorted((a, b) => group(a) - group(b))
		.map((attribute) => ({
			attribute,
			hue: attribute.value ? TAG_HUES[group(attribute) % TAG_HUES.length] : undefined
		}));
}

/** For searching: "zygio" finds "Žygio batai", since phone keyboards often skip the Lithuanian letters. */
export const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** An attribute name attributeText can write safely: a ":" in it would split it wrongly when read back. */
export const attributeName = (name: string) => name.replaceAll(':', '').trim();

/** The tag typed into "Požymis" + "Reikšmė". A value without a name becomes a plain tag; null when both are empty. */
export function typedAttribute(name: string, value: string) {
	const cleanName = attributeName(name);
	const cleanValue = value.trim();
	if (cleanName) return { name: cleanName, value: cleanValue };
	return cleanValue ? { name: attributeName(cleanValue), value: '' } : null;
}

export const itemFormValues = (item: Omit<InventoryItem, 'id'>): ItemFormValues => ({
	name: item.name,
	category: item.category,
	suitability: item.suitability,
	attributes: item.attributes.map(attributeText).join('\n')
});

/** Reads a submitted item form. `input` is ready to save when `errors` is empty (FR-14). */
export function readItemForm(data: FormData) {
	// one field per tag, plus the pair still being typed: it's never lost on "Išsaugoti"
	const typed = typedAttribute(String(data.get('attributeName') ?? ''), String(data.get('attributeValue') ?? ''));
	const values: ItemFormValues = {
		name: String(data.get('name') ?? '').trim(),
		category: String(data.get('category') ?? ''),
		suitability: data.getAll('suitability').map(String),
		attributes: [...data.getAll('attributes').map(String), ...(typed ? [attributeText(typed)] : [])].join('\n')
	};
	const attributes = parseAttributes(values.attributes);
	const { name: maxName, attributes: maxAttributes, attributeText: maxText } = ITEM_LIMITS;

	const errors: ItemFormErrors = {};
	if (!values.name) errors.name = 'Įvesk daikto pavadinimą.';
	else if (values.name.length > maxName) errors.name = `Pavadinimas per ilgas: daugiausia ${maxName} simbolių.`;
	if (!ITEM_CATEGORIES.includes(values.category as ItemCategory)) errors.category = 'Pasirink kategoriją.';
	if (attributes.length > maxAttributes || attributes.some((a) => a.name.length > maxText || a.value.length > maxText)) {
		errors.attributes = `Požymių gali būti daugiausia ${maxAttributes}, kiekvienas – iki ${maxText} simbolių.`;
	}

	const input: ItemInput = {
		name: values.name,
		category: values.category as ItemCategory,
		suitability: TEMPERATURES.filter((t) => values.suitability.includes(t)), // drops anything unknown
		attributes
	};
	return { values, errors, input, ok: Object.keys(errors).length === 0 };
}
