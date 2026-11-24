// Self-check for item recognition (UC-3): request body, answer checks, error mapping, retries, every mock scenario
// and the form pre-fill. Run: npm run check:recognition
// No network: the llama-server client gets a stubbed fetch, the rest uses the mocks the app plays (RECOGNITION_MOCK).
// Test against a real llama-server by hand.
import assert from 'node:assert/strict';
import { ITEM_CATEGORIES, RECOGNITION_CHECK_BELOW } from '#lib/domain.ts';
import { MOCK_RESPONSES, isMockScenario, mockModel, type MockScenario } from '#lib/server/recognition-mocks.ts';
import {
	MAX_ATTEMPTS,
	RECOGNITION_TIMEOUT_MS,
	RecognitionError,
	llamaModel,
	parseRecognition,
	recognitionRequest,
	recognizeItem
} from '#lib/server/recognition.ts';
import { itemFormValues, readItemForm } from '#lib/validation.ts';

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
assert.throws(() => parseRecognition(answer({ recognized: 'taip' })), RecognitionError, 'no verdict = broken answer');
assert.throws(() => parseRecognition('null'), RecognitionError);
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

// The real client: llama-server (stubbed fetch)
let calls: { url: string; init: RequestInit }[] = [];
const stub = (respond: () => Response | Promise<Response>) => {
	calls = [];
	globalThis.fetch = async (url, init) => {
		calls.push({ url: String(url), init: init! });
		return respond();
	};
};
const reply = (content: string, finish_reason = 'stop') =>
	Response.json({ choices: [{ finish_reason, message: { role: 'assistant', content } }] });
const llama = llamaModel({ url: 'http://model-box:8080/', apiKey: 'secret' });
const failsWith = (message: RegExp) => (e: unknown) => e instanceof RecognitionError && message.test(e.message);

stub(() => reply(answer({})));
assert.equal((await recognizeItem(webp, llama))?.name, 'Žygio batai');
assert.equal(calls[0].url, 'http://model-box:8080/v1/chat/completions', 'trailing slash handled');
assert.equal((calls[0].init.headers as Record<string, string>).authorization, 'Bearer secret');
assert.ok(calls[0].init.signal instanceof AbortSignal, 'request has a timeout');

stub(() => reply(answer({}), 'length'));
await assert.rejects(recognizeItem(webp, llama), failsWith(/Nepavyko/), 'cut-off answer');
assert.equal(calls.length, 1, 'a broken answer is not retried');
stub(() => new Response('Unauthorized', { status: 401 }));
await assert.rejects(recognizeItem(webp, llama), failsWith(/Nepavyko/), 'wrong API key');
assert.equal(calls.length, 1, 'a config error is not retried');
stub(() => new Response('Loading model', { status: 503 }));
await assert.rejects(recognizeItem(webp, llama), failsWith(/Nepavyko/), 'model still loading');
assert.equal(calls.length, MAX_ATTEMPTS, 'busy model is retried');
stub(() => Promise.reject(new TypeError('fetch failed')));
await assert.rejects(recognizeItem(webp, llama), failsWith(/Nepavyko/), 'device unreachable');
assert.equal(calls.length, MAX_ATTEMPTS, 'unreachable device is retried');
stub(() => (calls.length === 1 ? Promise.reject(new TypeError('fetch failed')) : reply(answer({}))));
assert.equal((await recognizeItem(webp, llama))?.name, 'Žygio batai', 'dropped connection, the retry works');
stub(() => Promise.reject(new DOMException('timed out', 'TimeoutError')));
await assert.rejects(recognizeItem(webp, llama), failsWith(/per ilgai/), 'timeout has its own message');
assert.equal(calls.length, 1, 'a timeout is not retried (another 30 s)');
await assert.rejects(recognizeItem(webp, llamaModel({})), failsWith(/Nepavyko/), 'LLAMA_URL not set');

// Mock scenarios: the same objects the app plays with RECOGNITION_MOCK
const schema = recognitionRequest(webp).response_format.json_schema.schema;
for (const response of Object.values(MOCK_RESPONSES).flat()) {
	if (typeof response !== 'object' || response instanceof Error) continue;
	assert.deepEqual(Object.keys(response).sort(), [...schema.required].sort(), 'mock answers follow the contract');
}
assert.ok(isMockScenario('flaky') && !isMockScenario('toString'), 'RECOGNITION_MOCK check');

/** Recognises a photo with the scenario; counts the calls to the model. */
const recognize = async (scenario: MockScenario) => {
	const model = mockModel(scenario);
	let count = 0;
	const result = await recognizeItem(webp, (photo) => (count++, model(photo))).catch((error: unknown) => error);
	return { result, calls: count };
};
const item = (result: unknown) => {
	assert.ok(result && typeof result === 'object' && 'confidence' in result, `expected an item, got ${result}`);
	return result as NonNullable<Awaited<ReturnType<typeof recognizeItem>>>;
};

// FR-19/FR-20: the item with its confidence; the 70 % threshold
const confident = await recognize('confident');
assert.deepEqual(item(confident.result), {
	name: 'Žygio batai',
	category: 'FOOTWEAR',
	attributes: MOCK_RESPONSES.confident.attributes,
	confidence: 92
});
const needsCheck = (result: unknown) => item(result).confidence < RECOGNITION_CHECK_BELOW; // the page's test
assert.equal(needsCheck(confident.result), false, '92 %: no "Patikrinkite"');
assert.equal(needsCheck((await recognize('threshold')).result), false, 'exactly 70 %: no tag');
assert.equal(needsCheck((await recognize('lowConfidence')).result), true, '69 %: "Patikrinkite"');

// Some attributes missing: only what the model saw is filled in, nothing is made up
const missing = item((await recognize('missingAttributes')).result);
assert.deepEqual(missing.attributes, [{ name: 'spalva', value: 'ruda' }]);

// FR-21: not recognised -> null (the page shows the photo tip and the manual form)
assert.deepEqual(await recognize('notRecognized'), { result: null, calls: 1 });

// Broken answer: fails at once
const invalid = await recognize('invalid');
assert.ok(failsWith(/Nepavyko/)(invalid.result), 'invalid answer -> error for the user');
assert.equal(invalid.calls, 1, 'invalid answer is not retried');

// Errors and retries
const timeout = await recognize('timeout');
assert.ok(failsWith(/per ilgai/)(timeout.result), 'timeout -> "užtruko per ilgai", the page offers "Bandyti dar kartą"');
assert.equal(timeout.calls, 1, 'timeout is not retried automatically');
const unreachable = await recognize('unreachable');
assert.ok(failsWith(/Nepavyko/)(unreachable.result), 'retry, then give up');
assert.equal(unreachable.calls, MAX_ATTEMPTS);
const flaky = await recognize('flaky');
assert.equal(item(flaky.result).name, 'Žygio batai', 'retry, then success');
assert.equal(flaky.calls, 2);

// The recognised item pre-fills the add form (UC-3): saved untouched, ?/create gets exactly what the model said
const { name, category, attributes: recognized } = item(confident.result);
const filled = itemFormValues({ name, category, suitability: [], attributes: recognized });
const data = new FormData();
data.set('name', filled.name);
data.set('category', filled.category);
data.set('attributes', filled.attributes);
assert.deepEqual(readItemForm(data).input, { name, category, suitability: [], attributes: recognized });
// Recognising writes nothing (no DB in this script): only "Išsaugoti" on the form reaches the inventory.

console.log('recognition checks passed');
