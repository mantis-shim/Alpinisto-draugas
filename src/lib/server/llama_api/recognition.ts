// UC-3: recognise an item in a photo with llama-server on the team's model device (LLAMA_URL).
import { createHash } from 'node:crypto';
import { ITEM_CATEGORIES, type ItemCategory } from '#lib/domain.ts';
import type { ModelPhoto } from '#lib/server/photo.ts';

export const RECOGNITION_TIMEOUT_MS = 30_000;

export const PHOTO_VERDICTS = ['OK', 'BLURRY', 'TOO_DARK', 'SEVERAL_ITEMS', 'NO_GEAR'] as const;
export type PhotoProblem = Exclude<(typeof PHOTO_VERDICTS)[number], 'OK'>;

export const PHOTO_PROBLEM_TIPS: Record<PhotoProblem, string> = {
	BLURRY: 'Nuotrauka neryški, daikto neįžiūrėti. Laikyk telefoną ramiai, palauk, kol vaizdas taps ryškus, ir fotografuok dar kartą.',
	TOO_DARK: 'Nuotrauka per tamsi. Fotografuok daiktą šviesioje vietoje.',
	SEVERAL_ITEMS: 'Nuotraukoje keli daiktai. Fotografuok po vieną daiktą kadre.',
	NO_GEAR: 'Nuotraukoje neradome žygio ekipuotės. Fotografuok daiktą iš arčiau, šviesioje vietoje, po vieną kadre.'
};

// The model picks English options and we write the Lithuanian: its own Lithuanian was made-up words.
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
	'GPS device': ['GPS imtuvas', 'NAVIGATION'],
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
const COLOURS: Record<string, string> = {
	black: 'juoda',
	white: 'balta',
	grey: 'pilka',
	brown: 'ruda',
	beige: 'smėlio',
	red: 'raudona',
	orange: 'oranžinė',
	yellow: 'geltona',
	green: 'žalia',
	blue: 'mėlyna',
	purple: 'violetinė',
	pink: 'rožinė',
	multicoloured: 'marga'
};
const MATERIALS: Record<string, string> = {
	leather: 'oda',
	'synthetic fabric': 'sintetinis audinys',
	fleece: 'flisas',
	wool: 'vilna',
	down: 'pūkai',
	cotton: 'medvilnė',
	plastic: 'plastikas',
	metal: 'metalas',
	rubber: 'guma'
};

/** The model's raw answer, untrusted until parseRecognition. */
export type ModelAnswer = {
	photo: (typeof PHOTO_VERDICTS)[number];
	item: string;
	category: ItemCategory; // only used for "other"
	colour: string;
	material: string;
	confidence: number;
};

export type RecognizedItem = {
	name: string; // '' when the model said "other"
	category: ItemCategory;
	attributes: { name: string; value: string }[];
	confidence: number;
};

/** llamaModel or mockModel. Throws ModelUnavailable (retried), a TimeoutError or any other error. */
export type RecognitionModel = (photo: ModelPhoto, regenerate?: boolean) => Promise<string>;

export class ModelUnavailable extends Error {}

/** Its message is shown to the user. */
export class RecognitionError extends Error {}

const FAILED = 'Nepavyko atpažinti daikto. Bandyk dar kartą arba pridėk daiktą ranka.';
const TOO_SLOW = 'Atpažinimas užtruko per ilgai. Bandyk dar kartą arba pridėk daiktą ranka.';
export const MAX_ATTEMPTS = 2;
export const MAX_REGENERATIONS = 5;
const REGENERATE_TEMPERATURE = 0.6; // 0.8 turned boots into sunglasses
const REGENERATE_WITHIN_MS = 30 * 60_000;

// Short on purpose: a longer prompt with more context made this 3B model worse.
const PROMPT = `You look at photos for a hiking app. A beginner hiker photographs one piece of their own gear to add it to their gear list; they check your answer before saving it.
Answer only with JSON that matches the schema.
- photo: OK when one item is clearly visible. BLURRY: out of focus, the item can't be made out. TOO_DARK: too dark to see the item. SEVERAL_ITEMS: two or more different items and none is clearly the main one; a pair of boots or gloves is one item. NO_GEAR: no hiking gear at all, e.g. a landscape, a person or a room.
- item: what the item is; "other" if no option fits.
- category: FOOTWEAR, CLOTHING, SLEEP (tent, sleeping bag, mat), NAVIGATION, MEDICINE (first aid, sunscreen), FOOD (food, water, cooking), TOOLS, OTHER.
- colour, material: the main ones you can see; "unclear" if you can't tell.
- confidence: 0-100, how sure you are about item. 90 or more only when it is unmistakable.`;

const SCHEMA = {
	type: 'object',
	required: ['photo', 'item', 'category', 'colour', 'material', 'confidence'],
	properties: {
		photo: { enum: PHOTO_VERDICTS },
		item: { enum: [...Object.keys(ITEM_TYPES), 'other'] },
		category: { enum: ITEM_CATEGORIES },
		colour: { enum: [...Object.keys(COLOURS), 'unclear'] },
		material: { enum: [...Object.keys(MATERIALS), 'unclear'] },
		confidence: { type: 'integer', minimum: 0, maximum: 100 }
	}
};
// The photo already passed, and "other" would empty the name the user has.
const REGENERATE_SCHEMA = {
	...SCHEMA,
	properties: { ...SCHEMA.properties, photo: { enum: ['OK'] }, item: { enum: Object.keys(ITEM_TYPES) } }
};

// A regeneration sends the same messages, so llama-server's prompt cache skips the image step (~3 s instead of ~20 s).
export const recognitionRequest = ({ bytes, format }: ModelPhoto, regenerate = false) => ({
	messages: [
		{ role: 'system', content: PROMPT },
		{
			role: 'user',
			content: [
				{ type: 'image_url', image_url: { url: `data:image/${format};base64,${Buffer.from(bytes).toString('base64')}` } },
				{ type: 'text', text: 'What is in this photo?' }
			]
		}
	],
	response_format: { type: 'json_schema', json_schema: { name: 'item', schema: regenerate ? REGENERATE_SCHEMA : SCHEMA } },
	temperature: regenerate ? REGENERATE_TEMPERATURE : 0.1,
	cache_prompt: true,
	max_tokens: 200
});

const pick = (options: Record<string, string>, key: unknown) =>
	typeof key === 'string' && Object.hasOwn(options, key) ? options[key] : undefined;

export function parseRecognition(content: string): RecognizedItem | PhotoProblem {
	let answer;
	try {
		answer = JSON.parse(content);
	} catch (error) {
		throw new RecognitionError(FAILED, { cause: error });
	}
	if (!PHOTO_VERDICTS.includes(answer?.photo)) {
		throw new RecognitionError(FAILED, { cause: new Error(`answer without "photo": ${content.slice(0, 300)}`) });
	}
	if (answer.photo !== 'OK') return answer.photo;
	const [name, category] = (typeof answer.item === 'string' && Object.hasOwn(ITEM_TYPES, answer.item)
		? ITEM_TYPES[answer.item]
		: ['', ITEM_CATEGORIES.includes(answer.category) ? answer.category : 'OTHER']) as [string, ItemCategory];
	const colour = pick(COLOURS, answer.colour);
	const material = pick(MATERIALS, answer.material);
	const attributes = [
		...(colour ? [{ name: 'spalva', value: colour }] : []),
		...(material ? [{ name: 'medžiaga', value: material }] : [])
	];
	const confidence = Number.isFinite(answer.confidence) ? Math.round(Math.min(100, Math.max(0, answer.confidence))) : 0;
	return { name, category, attributes, confidence };
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
): Promise<RecognizedItem | PhotoProblem> {
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
