// Self-check for item recognition (UC-3): request body, answer checks, error mapping. Run: npm run check:recognition
// No network: fetch is replaced by a stub. Test against a real llama-server by hand.
import assert from 'node:assert/strict';
import { ITEM_CATEGORIES } from '#lib/domain.ts';
import {
	RECOGNITION_TIMEOUT_MS,
	RecognitionError,
	parseRecognition,
	recognitionRequest,
	recognizeItem
} from '#lib/server/recognition.ts';

assert.equal(RECOGNITION_TIMEOUT_MS, 30_000);

// Request: OpenAI chat format, the photo as a WebP data URL, the answer constrained by a JSON schema
const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3]);
const request = recognitionRequest(webp);
const image = request.messages[1].content[0] as { image_url: { url: string } };
assert.equal(image.image_url.url, `data:image/webp;base64,${Buffer.from(webp).toString('base64')}`);
assert.deepEqual(request.response_format.json_schema.schema.properties.category.enum, ITEM_CATEGORIES);

// Answers
const answer = (fields: object) =>
	JSON.stringify({ recognized: true, name: 'Žygio batai', category: 'FOOTWEAR', attributes: [], confidence: 85, ...fields });

assert.deepEqual(
	parseRecognition(answer({ attributes: [{ name: 'spalva', value: 'ruda' }, { name: 'neperšlampamas', value: '' }] })),
	{
		name: 'Žygio batai',
		category: 'FOOTWEAR',
		attributes: [
			{ name: 'spalva', value: 'ruda' },
			{ name: 'neperšlampamas', value: '' }
		],
		confidence: 85
	}
);
assert.equal(parseRecognition(answer({ recognized: false })), null, 'model says it cannot tell');
assert.equal(parseRecognition(answer({ name: '   ' })), null, 'no name = not recognised');
assert.equal(parseRecognition(answer({ category: 'SHOES' }))?.category, 'OTHER', 'unknown category');
assert.equal(parseRecognition(answer({ confidence: 140 }))?.confidence, 100);
assert.equal(parseRecognition(answer({ confidence: -3 }))?.confidence, 0);
assert.equal(parseRecognition(answer({ confidence: 'high' }))?.confidence, 0, 'missing confidence -> "Patikrinkite"');
assert.equal(parseRecognition(answer({ name: 'x'.repeat(500) }))?.name.length, 100, 'name limit');
const attributes = parseRecognition(
	answer({ attributes: [{ name: 'svoris:', value: '1:2' }, { name: ' ', value: 'be pavadinimo' }, 'junk', null] })
)?.attributes;
assert.deepEqual(attributes, [{ name: 'svoris', value: '1:2' }], 'colon removed from names, junk dropped');
assert.equal(
	parseRecognition(answer({ attributes: Array.from({ length: 20 }, (_, i) => ({ name: `a${i}`, value: '' })) }))
		?.attributes.length,
	8
);
assert.throws(() => parseRecognition('not json'), RecognitionError);

// Calling llama-server (stubbed fetch)
const calls: { url: string; init: RequestInit }[] = [];
const stub = (respond: () => Response | Promise<Response>) => {
	globalThis.fetch = async (url, init) => {
		calls.push({ url: String(url), init: init! });
		return respond();
	};
};
const reply = (content: string, finish_reason = 'stop') =>
	Response.json({ choices: [{ finish_reason, message: { role: 'assistant', content } }] });
const llama = { url: 'http://model-box:8080/', apiKey: 'secret' };
const failsWith = (message: RegExp) => (e: unknown) => e instanceof RecognitionError && message.test(e.message);

stub(() => reply(answer({})));
assert.equal((await recognizeItem(webp, llama))?.name, 'Žygio batai');
assert.equal(calls[0].url, 'http://model-box:8080/v1/chat/completions', 'trailing slash handled');
assert.equal((calls[0].init.headers as Record<string, string>).authorization, 'Bearer secret');
assert.ok(calls[0].init.signal instanceof AbortSignal, 'request has a timeout');

stub(() => reply(answer({}), 'length'));
await assert.rejects(recognizeItem(webp, llama), failsWith(/Nepavyko/), 'cut-off answer');
stub(() => new Response('Unauthorized', { status: 401 }));
await assert.rejects(recognizeItem(webp, llama), failsWith(/Nepavyko/), 'wrong API key');
stub(() => new Response('Loading model', { status: 503 }));
await assert.rejects(recognizeItem(webp, llama), failsWith(/Nepavyko/), 'model still loading');
stub(() => Promise.reject(new TypeError('fetch failed')));
await assert.rejects(recognizeItem(webp, llama), failsWith(/Nepavyko/), 'device unreachable');
stub(() => Promise.reject(new DOMException('timed out', 'TimeoutError')));
await assert.rejects(recognizeItem(webp, llama), failsWith(/per ilgai/), 'timeout has its own message');
await assert.rejects(recognizeItem(webp, {}), failsWith(/Nepavyko/), 'LLAMA_URL not set');

console.log('recognition checks passed');
