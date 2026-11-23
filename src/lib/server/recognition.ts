// UC-3 step 2: ask the vision model on llama-server (OpenAI-compatible API) what item is in the photo.
// llama-server runs on a separate team device (LLAMA_URL); the photo goes only there, never to a third party.
// No `$app/env` import here: the caller passes the config, so scripts/check-recognition.ts runs this with plain Node.
import { ITEM_CATEGORIES, ITEM_LIMITS, type ItemCategory } from '#lib/domain.ts';

/** Team decision 2026-11-23: wait up to 30 s, not the spec's 10 s (NŠ-1). The local model needs longer. */
export const RECOGNITION_TIMEOUT_MS = 30_000;

export type RecognizedItem = {
	name: string;
	category: ItemCategory;
	attributes: { name: string; value: string }[];
	confidence: number; // 0–100, as the model reports it (not calibrated)
};

/** ponytail: canned answer while no llama-server is set up (dev only, see the inventory page). Delete once one runs. */
export const MOCK_RECOGNITION: RecognizedItem = {
	name: 'Žygio batai',
	category: 'FOOTWEAR',
	attributes: [{ name: 'spalva', value: 'ruda' }],
	confidence: 65 // below 70 on purpose, so the "Patikrinkite" tag shows
};

/** Recognition didn't work (server down, timeout, broken answer). The message is shown to the user as-is. */
export class RecognitionError extends Error {}

const FAILED = 'Nepavyko atpažinti daikto. Bandyk dar kartą arba pridėk daiktą ranka.';
const TOO_SLOW = 'Atpažinimas užtruko per ilgai. Bandyk dar kartą arba pridėk daiktą ranka.';
const MAX_ATTRIBUTES = 8; // ponytail: what a photo shows; ITEM_LIMITS.attributes (30) is for hand-typed items

// Instructions in English (small vision models follow them better), answers in Lithuanian.
const PROMPT = `You identify one piece of hiking gear in a photo for a beginner hiker's inventory app.
Answer only with JSON that matches the schema.
- recognized: false when there is no single clear item (several items, blurry, too dark, not gear). Then leave the other fields empty.
- name: the short common Lithuanian name of the item, e.g. "Žygio batai", "Miegmaišis", "Galvos žibintuvėlis".
- category: FOOTWEAR; CLOTHING; SLEEP (tent, sleeping bag, mat); NAVIGATION; MEDICINE (first aid); FOOD (food, water, bottles); TOOLS; OTHER.
- attributes: only what you can see, in Lithuanian, e.g. {"name":"spalva","value":"ruda"}, {"name":"medžiaga","value":"oda"}. Tags such as "neperšlampamas" get value "". Never guess what is not visible.
- confidence: 0-100, how sure you are about the name and the category.`;

const SCHEMA = {
	type: 'object',
	required: ['recognized', 'name', 'category', 'attributes', 'confidence'],
	properties: {
		recognized: { type: 'boolean' },
		name: { type: 'string', maxLength: ITEM_LIMITS.name },
		category: { enum: ITEM_CATEGORIES },
		attributes: {
			type: 'array',
			maxItems: MAX_ATTRIBUTES,
			items: {
				type: 'object',
				required: ['name', 'value'],
				properties: { name: { type: 'string' }, value: { type: 'string' } }
			}
		},
		confidence: { type: 'integer', minimum: 0, maximum: 100 }
	}
};

/** POST /v1/chat/completions body (OpenAI format). The schema becomes a grammar in llama-server, so the reply is JSON. */
export const recognitionRequest = (webp: Uint8Array) => ({
	messages: [
		{ role: 'system', content: PROMPT },
		{
			role: 'user',
			content: [
				{ type: 'image_url', image_url: { url: `data:image/webp;base64,${Buffer.from(webp).toString('base64')}` } },
				{ type: 'text', text: 'Koks daiktas šioje nuotraukoje?' }
			]
		}
	],
	response_format: { type: 'json_schema', json_schema: { name: 'item', schema: SCHEMA } },
	temperature: 0.1,
	max_tokens: 400
});

const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

/** Checks the model's JSON (it's still untrusted). Null when the model couldn't tell what the item is. */
export function parseRecognition(content: string): RecognizedItem | null {
	let answer;
	try {
		answer = JSON.parse(content);
	} catch (error) {
		throw new RecognitionError(FAILED, { cause: error });
	}
	const name = text(answer?.recognized === true && answer.name, ITEM_LIMITS.name);
	if (!name) return null;
	const category = ITEM_CATEGORIES.includes(answer.category) ? answer.category : 'OTHER';
	const attributes = (Array.isArray(answer.attributes) ? answer.attributes : [])
		.map((a: { name?: unknown; value?: unknown }) => ({
			// a ":" in the name would split wrongly in the "spalva: ruda" textarea
			name: text(a?.name, ITEM_LIMITS.attributeText).replaceAll(':', ''),
			value: text(a?.value, ITEM_LIMITS.attributeText)
		}))
		.filter((a: { name: string }) => a.name)
		.slice(0, MAX_ATTRIBUTES);
	const confidence = Number.isFinite(answer.confidence) ? Math.round(Math.min(100, Math.max(0, answer.confidence))) : 0;
	return { name, category, attributes, confidence };
}

/** Asks llama-server what item is in the WebP photo. Null if it can't tell. Throws RecognitionError. */
export async function recognizeItem(webp: Uint8Array, llama: { url?: string; apiKey?: string }) {
	if (!llama.url) throw new RecognitionError(FAILED, { cause: new Error('LLAMA_URL is not set') });
	let body;
	try {
		const response = await fetch(`${llama.url.replace(/\/+$/, '')}/v1/chat/completions`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', ...(llama.apiKey && { authorization: `Bearer ${llama.apiKey}` }) },
			body: JSON.stringify(recognitionRequest(webp)),
			signal: AbortSignal.timeout(RECOGNITION_TIMEOUT_MS) // covers reading the body too
		});
		if (!response.ok) throw new Error(`llama-server HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
		body = await response.json();
	} catch (error) {
		const slow = error instanceof DOMException && error.name === 'TimeoutError';
		throw new RecognitionError(slow ? TOO_SLOW : FAILED, { cause: error });
	}
	const choice = body?.choices?.[0];
	if (choice?.finish_reason !== 'stop' || typeof choice.message?.content !== 'string') {
		throw new RecognitionError(FAILED, { cause: new Error(`unexpected llama-server reply: ${JSON.stringify(body).slice(0, 300)}`) });
	}
	return parseRecognition(choice.message.content);
}
