// UC-3 step 2: ask the vision model what item is in the photo (FR-19), then check its answer.
// The real model is llama-server (OpenAI-compatible API) on a separate team device (LLAMA_URL); the photo goes only
// there, never to a third party. recognition-mocks.ts plays canned answers through the same seam (RecognitionModel).
// No `$app/env` import here: the caller passes the config, so scripts/check-recognition.ts runs this with plain Node.
import { ITEM_CATEGORIES, ITEM_LIMITS, type ItemCategory } from '#lib/domain.ts';
import { attributeName, attributeValue } from '#lib/validation.ts';

/** Team decision 2026-11-23: wait up to 30 s, not the spec's 10 s (NŠ-1). The local model needs longer. */
export const RECOGNITION_TIMEOUT_MS = 30_000;

/** The contract: the JSON the model answers with (SCHEMA below). Untrusted until parseRecognition has checked it. */
export type ModelAnswer = {
	recognized: boolean; // false: no single clear item in the photo, the other fields are then empty
	name: string;
	category: ItemCategory;
	attributes: { name: string; value: string }[]; // value '' for tags such as "neperšlampamas"
	confidence: number; // 0–100, as the model reports it (not calibrated)
};

/** A checked answer, ready for the review. */
export type RecognizedItem = Omit<ModelAnswer, 'recognized'>;

/**
 * The one seam between the app and the model: the WebP photo in, the model's raw answer (ModelAnswer as JSON text) out.
 * llamaModel is the real one, mockModel (recognition-mocks.ts) the stand-in. Throws ModelUnavailable when the model
 * can't be reached (retried), a TimeoutError DOMException, or any other error (not retried).
 */
export type RecognitionModel = (webp: Uint8Array) => Promise<string>;

/** The model device can't be reached or is busy (network error, HTTP 5xx). Worth one more try. */
export class ModelUnavailable extends Error {}

/** Recognition didn't work (server down, timeout, broken answer). The message is shown to the user as-is. */
export class RecognitionError extends Error {}

const FAILED = 'Nepavyko atpažinti daikto. Bandyk dar kartą arba pridėk daiktą ranka.';
const TOO_SLOW = 'Atpažinimas užtruko per ilgai. Bandyk dar kartą arba pridėk daiktą ranka.';
const MAX_ATTRIBUTES = 8; // ponytail: what a photo shows; ITEM_LIMITS.attributes (30) is for hand-typed items
/** Calls per photo when the model can't be reached. A timeout is not retried: that would be another 30 s. */
export const MAX_ATTEMPTS = 2;

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
	// no verdict at all is a broken answer, not "not recognised"; the other fields are salvaged below
	if (typeof answer?.recognized !== 'boolean') {
		throw new RecognitionError(FAILED, { cause: new Error(`answer without "recognized": ${content.slice(0, 300)}`) });
	}
	const name = text(answer.recognized && answer.name, ITEM_LIMITS.name);
	if (!name) return null;
	const category = ITEM_CATEGORIES.includes(answer.category) ? answer.category : 'OTHER';
	const attributes = (Array.isArray(answer.attributes) ? answer.attributes : [])
		.map((a: { name?: unknown; value?: unknown }) => ({
			name: attributeName(text(a?.name, ITEM_LIMITS.attributeText)),
			value: attributeValue(text(a?.value, ITEM_LIMITS.attributeText)) // a model's "true" = a plain tag
		}))
		.filter((a: { name: string }) => a.name)
		.slice(0, MAX_ATTRIBUTES);
	const confidence = Number.isFinite(answer.confidence) ? Math.round(Math.min(100, Math.max(0, answer.confidence))) : 0;
	return { name, category, attributes, confidence };
}

/** The real model: llama-server on the model device. */
export const llamaModel =
	(llama: { url?: string; apiKey?: string }): RecognitionModel =>
	async (webp) => {
		if (!llama.url) throw new Error('LLAMA_URL is not set');
		let response;
		try {
			response = await fetch(`${llama.url.replace(/\/+$/, '')}/v1/chat/completions`, {
				method: 'POST',
				headers: { 'content-type': 'application/json', ...(llama.apiKey && { authorization: `Bearer ${llama.apiKey}` }) },
				body: JSON.stringify(recognitionRequest(webp)),
				signal: AbortSignal.timeout(RECOGNITION_TIMEOUT_MS) // covers reading the body too
			});
		} catch (error) {
			// fetch fails with a TypeError when the device can't be reached; a timeout is a DOMException and passes through
			throw error instanceof TypeError ? new ModelUnavailable('llama-server unreachable', { cause: error }) : error;
		}
		if (!response.ok) {
			const message = `llama-server HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`;
			throw response.status >= 500 ? new ModelUnavailable(message) : new Error(message); // 503 while the model loads
		}
		const body = await response.json();
		const choice = body?.choices?.[0];
		if (choice?.finish_reason !== 'stop' || typeof choice.message?.content !== 'string') {
			throw new Error(`unexpected llama-server reply: ${JSON.stringify(body).slice(0, 300)}`);
		}
		return choice.message.content;
	};

/** Asks the model what item is in the WebP photo. Null if it can't tell (FR-21). Throws RecognitionError. */
export async function recognizeItem(webp: Uint8Array, model: RecognitionModel): Promise<RecognizedItem | null> {
	for (let attempt = 1; ; attempt++) {
		let content;
		try {
			content = await model(webp);
		} catch (error) {
			// ponytail: retries at once, which covers a dropped connection. Add a short wait if the device often answers 503.
			if (error instanceof ModelUnavailable && attempt < MAX_ATTEMPTS) continue;
			const slow = error instanceof DOMException && error.name === 'TimeoutError';
			throw new RecognitionError(slow ? TOO_SLOW : FAILED, { cause: error });
		}
		return parseRecognition(content); // a broken answer isn't retried: the same photo gets the same answer
	}
}
