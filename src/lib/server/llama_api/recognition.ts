// UC-3: recognise an item in a photo with llama-server on the team's model device (LLAMA_URL).
// The prompt, chat template and output grammar (gear.gbnf) live on the model device, so the app sends only the photo.
// The grammar makes the model answer in this text format, which parseRecognition turns into an item:
//   Hiking boots
//   Category: Footwear
//   Suitability: COLD, Warm
//   Attributes:
//   waterproof = yes
//   ankle_support = high
import { createHash } from 'node:crypto';
import { ITEM_CATEGORIES, TEMPERATURES, type InventoryItem, type ItemCategory } from '#lib/domain.ts';
import type { ModelPhoto } from '#lib/server/photo.ts';

export const RECOGNITION_TIMEOUT_MS = 30_000;

// The model answers in English (its own Lithuanian was made-up words); we write the Lithuanian.
// Looked up without case and a final "s" (see itemKey), so "Hiking boot" is found too.
const ITEM_TYPES: Record<string, [name: string, category: ItemCategory]> = {
	'hiking boots': ['Žygio batai', 'FOOTWEAR'],
	'trail shoes': ['Žygio bateliai', 'FOOTWEAR'],
	'hiking socks': ['Žygio kojinės', 'FOOTWEAR'],
	backpack: ['Kuprinė', 'OTHER'],
	'rain jacket': ['Neperšlampama striukė', 'CLOTHING'],
	'fleece jacket': ['Flisinis džemperis', 'CLOTHING'],
	'down jacket': ['Pūkinė striukė', 'CLOTHING'],
	'thermal underwear': ['Termo apatiniai', 'CLOTHING'],
	'hiking trousers': ['Žygio kelnės', 'CLOTHING'],
	hat: ['Kepurė', 'CLOTHING'],
	gloves: ['Pirštinės', 'CLOTHING'],
	'sleeping bag': ['Miegmaišis', 'SLEEP'],
	'sleeping mat': ['Kilimėlis', 'SLEEP'],
	tent: ['Palapinė', 'SLEEP'],
	map: ['Žemėlapis', 'NAVIGATION'],
	compass: ['Kompasas', 'NAVIGATION'],
	'gps device': ['GPS imtuvas', 'NAVIGATION'],
	headlamp: ['Galvos žibintuvėlis', 'TOOLS'],
	flashlight: ['Žibintuvėlis', 'TOOLS'],
	'first aid kit': ['Vaistinėlė', 'MEDICINE'],
	sunscreen: ['Kremas nuo saulės', 'MEDICINE'],
	'insect repellent': ['Priemonė nuo uodų', 'MEDICINE'],
	'water bottle': ['Gertuvė', 'FOOD'],
	thermos: ['Termosas', 'FOOD'],
	'camping stove': ['Turistinė viryklė', 'FOOD'],
	'cooking pot': ['Katiliukas', 'FOOD'],
	'trekking poles': ['Žygio lazdos', 'TOOLS'],
	'pocket knife': ['Kišeninis peilis', 'TOOLS'],
	'power bank': ['Išorinė baterija', 'TOOLS'],
	sunglasses: ['Saulės akiniai', 'OTHER']
};
const itemKey = (name: string) => name.trim().toLowerCase().replace(/s$/, '');
const ITEM_NAMES = new Map(Object.entries(ITEM_TYPES).map(([english, item]) => [itemKey(english), item]));

// Every attribute line gear.gbnf allows -> the inventory attribute (value '' = "taip", see attributeValue).
const ATTRIBUTES: Record<string, [name: string, value: string]> = {
	'waterproof = yes': ['neperšlampamas', ''],
	'waterproof = partially': ['neperšlampamas', 'iš dalies'],
	'waterproof = no': ['neperšlampamas', 'ne'],
	'windproof = yes': ['neperpučiamas', ''],
	'windproof = no': ['neperpučiamas', 'ne'],
	'layer = base': ['sluoksnis', 'apatinis'],
	'layer = mid': ['sluoksnis', 'vidurinis'],
	'layer = outer': ['sluoksnis', 'viršutinis'],
	'ankle_support = low': ['kulkšnies fiksacija', 'silpna'],
	'ankle_support = mid': ['kulkšnies fiksacija', 'vidutinė'],
	'ankle_support = high': ['kulkšnies fiksacija', 'stipri'],
	'capacity = single': ['talpa', 'vienam asmeniui'],
	'capacity = double': ['talpa', 'dviem asmenims'],
	'capacity = group': ['talpa', 'grupei'],
	'requires_fuel = yes': ['reikia kuro', ''],
	'requires_fuel = no': ['reikia kuro', 'ne'],
	'requires_power = yes': ['reikia elektros', ''],
	'requires_power = no': ['reikia elektros', 'ne'],
	'requires_power = battery': ['maitinimas', 'baterijos'],
	'requires_power = rechargeable': ['maitinimas', 'įkraunamas'],
	'prep_needed = ready_to_eat': ['paruošimas', 'paruoštas valgyti'],
	'prep_needed = boil_water': ['paruošimas', 'užpilti verdančiu vandeniu'],
	'prep_needed = cook': ['paruošimas', 'reikia virti'],
	'pack_volume = compact': ['užima vietos', 'mažai'],
	'pack_volume = medium': ['užima vietos', 'vidutiniškai'],
	'pack_volume = bulky': ['užima vietos', 'daug']
};

/** name is '' when we have no Lithuanian name for what the model said: the user types it. */
export type RecognizedItem = Omit<InventoryItem, 'id'>;

/** llamaModel or mockModel. Throws ModelUnavailable (retried), a TimeoutError or any other error. */
export type RecognitionModel = (photo: ModelPhoto, regenerate?: boolean) => Promise<string>;

export class ModelUnavailable extends Error {}

/** Its message is shown to the user. */
export class RecognitionError extends Error {}

const FAILED = 'Nepavyko atpažinti daikto. Bandyk dar kartą arba pridėk daiktą ranka.';
const TOO_SLOW = 'Atpažinimas užtruko per ilgai. Bandyk dar kartą arba pridėk daiktą ranka.';
export const MAX_ATTEMPTS = 2;
export const MAX_REGENERATIONS = 5;
const REGENERATE_TEMPERATURE = 0.3; // 0.8 turned boots into sunglasses
const REGENERATE_WITHIN_MS = 30 * 60_000;

// Only the photo: no prompt (the model device's chat template has it) and no response_format, which would
// replace the device's grammar. A regeneration sends the same messages, so llama-server's prompt cache skips
// the image step (~3 s instead of ~20 s).
export const recognitionRequest = ({ bytes, format }: ModelPhoto, regenerate = false) => ({
	messages: [
		{
			role: 'user',
			content: [{ type: 'image_url', image_url: { url: `data:image/${format};base64,${Buffer.from(bytes).toString('base64')}` } }]
		}
	],
	temperature: regenerate ? REGENERATE_TEMPERATURE : 0.1,
	cache_prompt: true,
	max_tokens: 200
});

const ANSWER = /^(.+)\nCategory: (\w+)\nSuitability: (.+)\nAttributes:((?:\n.+)*)\n*$/;

/** The model's text answer (format at the top of this file) -> the item for the add form. */
export function parseRecognition(content: string): RecognizedItem {
	const [, english, modelCategory, temperatures, lines] = ANSWER.exec(content.trim()) ?? [];
	const category = modelCategory?.toUpperCase() as ItemCategory;
	if (!ITEM_CATEGORIES.includes(category)) {
		throw new RecognitionError(FAILED, { cause: new Error(`unexpected answer: ${content.slice(0, 300)}`) });
	}
	const [name, knownCategory] = ITEM_NAMES.get(itemKey(english)) ?? ['', category];
	const suitability = TEMPERATURES.filter((t) => temperatures.toUpperCase().split(', ').includes(t));
	const attributes = lines
		.split('\n')
		.filter((line) => Object.hasOwn(ATTRIBUTES, line.trim()))
		.map((line) => ATTRIBUTES[line.trim()])
		.map(([name, value]) => ({ name, value }));
	return { name, category: knownCategory, suitability, attributes };
}

export const llamaModel =
	(llama: { url?: string; apiKey?: string }): RecognitionModel =>
	async (photo, regenerate) => {
		if (!llama.url) throw new Error('LLAMA_URL is not set');
		let response;
		try {
			response = await fetch(`${llama.url.replace(/\/+$/, '')}/v1/chat/completions`, {
				method: 'POST',
				headers: { 'content-type': 'application/json', ...(llama.apiKey && { authorization: `Bearer ${llama.apiKey}` }) },
				body: JSON.stringify(recognitionRequest(photo, regenerate)),
				signal: AbortSignal.timeout(RECOGNITION_TIMEOUT_MS)
			});
		} catch (error) {
			// TypeError: device unreachable. A timeout passes through.
			throw error instanceof TypeError ? new ModelUnavailable('llama-server unreachable', { cause: error }) : error;
		}
		if (!response.ok) {
			const message = `llama-server HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`;
			throw response.status >= 500 ? new ModelUnavailable(message) : new Error(message);
		}
		const body = await response.json();
		const choice = body?.choices?.[0];
		if (choice?.finish_reason !== 'stop' || typeof choice.message?.content !== 'string') {
			throw new Error(`unexpected llama-server reply: ${JSON.stringify(body).slice(0, 300)}`);
		}
		return choice.message.content;
	};

export async function recognizeItem(
	photo: ModelPhoto,
	model: RecognitionModel,
	regenerate = false
): Promise<RecognizedItem> {
	for (let attempt = 1; ; attempt++) {
		let content;
		try {
			content = await model(photo, regenerate);
		} catch (error) {
			if (error instanceof ModelUnavailable && attempt < MAX_ATTEMPTS) continue;
			const slow = error instanceof DOMException && error.name === 'TimeoutError';
			throw new RecognitionError(slow ? TOO_SLOW : FAILED, { cause: error });
		}
		return parseRecognition(content);
	}
}

// Per user: a hash of the last successfully recognised photo, never the photo itself.
// ponytail: in memory, so a restart forgets it; several server processes would need the sessions collection.
const lastRecognized = new Map<string, { photoHash: string; left: number; until: number }>();
const hash = (photo: { bytes: Uint8Array }) => createHash('sha256').update(photo.bytes).digest('base64url');

export const forgetRecognition = (userId: string) => lastRecognized.delete(userId);

export function allowRegeneration(userId: string, photo: { bytes: Uint8Array }, now = Date.now()) {
	lastRecognized.set(userId, { photoHash: hash(photo), left: MAX_REGENERATIONS, until: now + REGENERATE_WITHIN_MS });
	return MAX_REGENERATIONS;
}

/** Regenerations left after this one, or null if this photo may not be regenerated. */
export function takeRegeneration(userId: string, photo: { bytes: Uint8Array }, now = Date.now()) {
	const last = lastRecognized.get(userId);
	if (!last || last.left < 1 || now > last.until || last.photoHash !== hash(photo)) return null;
	return --last.left; // before the model call, so parallel requests can't exceed the limit
}
