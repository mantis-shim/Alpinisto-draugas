// Self-check for item recognition (UC-3): request body, answer parsing, error mapping, retries, every mock scenario,
// the form pre-fill and who may regenerate. Run: npm run check:recognition
// No network: the llama-server client gets a stubbed fetch, the rest uses the mocks the app plays (RECOGNITION_MOCK).
// Test against a real llama-server by hand.
import assert from 'node:assert/strict';
import { MOCK_RESPONSES, isMockScenario, mockModel, type MockScenario } from '#lib/server/llama_api/recognition-mocks.ts';
import {
	MAX_ATTEMPTS,
	MAX_REGENERATIONS,
	RECOGNITION_TIMEOUT_MS,
	RecognitionError,
	allowRegeneration,
	forgetRecognition,
	llamaModel,
	parseRecognition,
	recognitionRequest,
	recognizeItem,
	takeRegeneration,
	type RecognizedItem
} from '#lib/server/llama_api/recognition.ts';
import { itemFormValues, readItemForm } from '#lib/validation.ts';

assert.equal(RECOGNITION_TIMEOUT_MS, 30_000);

// Request: OpenAI chat format with only the JPG/PNG photo in a data URL (HEIC arrives here already as PNG).
// The prompt and the answer's grammar live on the model device; a response_format would replace that grammar.
const photo = { bytes: new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]), format: 'jpeg' as const };
const request = recognitionRequest(photo);
assert.deepEqual(request.messages, [
	{
		role: 'user',
		content: [{ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${Buffer.from(photo.bytes).toString('base64')}` } }]
	}
]);
assert.ok(recognitionRequest({ ...photo, format: 'png' }).messages[0].content[0].image_url.url.startsWith('data:image/png;base64,'));
assert.ok(!('response_format' in request), "the device's grammar shapes the answer");
// Regenerating: the very same messages (llama-server reuses the processed photo), only a higher temperature
const regenerated = recognitionRequest(photo, true);
assert.deepEqual(regenerated.messages, request.messages);
assert.ok(regenerated.temperature > request.temperature && regenerated.cache_prompt);

// Answers: text in the grammar's format; the app writes the Lithuanian
const answer = ({
	name = 'Hiking boots',
	category = 'Footwear',
	suitability = 'COLD, Warm',
	attributes = ['waterproof = yes', 'ankle_support = high']
} = {}) => `${name}\nCategory: ${category}\nSuitability: ${suitability}\nAttributes:${attributes.map((a) => `\n${a}`).join('')}\n`;

assert.deepEqual(parseRecognition(answer()), {
	name: 'Žygio batai',
	category: 'FOOTWEAR',
	suitability: ['COLD', 'WARM'],
	attributes: [
		{ name: 'neperšlampamas', value: '' },
		{ name: 'kulkšnies fiksacija', value: 'stipri' }
	]
});
assert.deepEqual(parseRecognition(answer().trimEnd()), parseRecognition(answer()), 'with or without the final newline');
assert.equal(parseRecognition(answer({ name: 'Hiking boot' })).name, 'Žygio batai', 'singular finds the plural');
assert.equal(parseRecognition(answer({ name: 'Gps device', category: 'Tools' })).name, 'GPS imtuvas');
assert.equal(parseRecognition(answer({ name: 'Headlamp', category: 'Navigation' })).category, 'TOOLS', 'a known item has its own category');
assert.deepEqual(
	[parseRecognition(answer({ name: 'Ice axe', category: 'Tools' })), parseRecognition(answer({ name: 'ToString' }))].map(
		({ name, category }) => [name, category]
	),
	[['', 'TOOLS'], ['', 'FOOTWEAR']],
	"no Lithuanian name: the user types it, the model's category stays"
);
assert.deepEqual(parseRecognition(answer({ suitability: 'COLD, Warm, HOT' })).suitability, ['COLD', 'WARM', 'HOT']);
assert.deepEqual(parseRecognition(answer({ suitability: 'Warm' })).suitability, ['WARM']);
assert.deepEqual(parseRecognition(answer({ attributes: [] })).attributes, [], 'no attributes');
assert.deepEqual(
	parseRecognition(answer({ attributes: ['waterproof = no', 'colour = red', 'toString', 'pack_volume = compact'] })).attributes,
	[
		{ name: 'neperšlampamas', value: 'ne' },
		{ name: 'užima vietos', value: 'mažai' }
	],
	'only lines the grammar allows, nothing inherited'
);
assert.throws(() => parseRecognition(answer({ category: 'Shoes' })), RecognitionError, 'unknown category = broken');
assert.throws(() => parseRecognition('{"item": "hiking boots"}'), RecognitionError, 'not the grammar (JSON) = broken');
assert.throws(() => parseRecognition(''), RecognitionError);

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

stub(() => reply(answer()));
assert.equal((await recognizeItem(photo, llama)).name, 'Žygio batai');
assert.equal(calls[0].url, 'http://model-box:8080/v1/chat/completions', 'trailing slash handled');
assert.equal((calls[0].init.headers as Record<string, string>).authorization, 'Bearer secret');
assert.ok(calls[0].init.signal instanceof AbortSignal, 'request has a timeout');
await recognizeItem(photo, llama, true);
assert.equal(JSON.parse(String(calls[1].init.body)).temperature, regenerated.temperature, 'regeneration reaches the model');

stub(() => reply(answer(), 'length'));
await assert.rejects(recognizeItem(photo, llama), failsWith(/Nepavyko/), 'cut-off answer');
assert.equal(calls.length, 1, 'a broken answer is not retried');
stub(() => new Response('Unauthorized', { status: 401 }));
await assert.rejects(recognizeItem(photo, llama), failsWith(/Nepavyko/), 'wrong API key');
assert.equal(calls.length, 1, 'a config error is not retried');
stub(() => new Response('Loading model', { status: 503 }));
await assert.rejects(recognizeItem(photo, llama), failsWith(/Nepavyko/), 'model still loading');
assert.equal(calls.length, MAX_ATTEMPTS, 'busy model is retried');
stub(() => Promise.reject(new TypeError('fetch failed')));
await assert.rejects(recognizeItem(photo, llama), failsWith(/Nepavyko/), 'device unreachable');
assert.equal(calls.length, MAX_ATTEMPTS, 'unreachable device is retried');
stub(() => (calls.length === 1 ? Promise.reject(new TypeError('fetch failed')) : reply(answer())));
assert.equal((await recognizeItem(photo, llama)).name, 'Žygio batai', 'dropped connection, the retry works');
stub(() => Promise.reject(new DOMException('timed out', 'TimeoutError')));
await assert.rejects(recognizeItem(photo, llama), failsWith(/per ilgai/), 'timeout has its own message');
assert.equal(calls.length, 1, 'a timeout is not retried (another 30 s)');
await assert.rejects(recognizeItem(photo, llamaModel({})), failsWith(/Nepavyko/), 'LLAMA_URL not set');

// Mock scenarios: the same replies the app plays with RECOGNITION_MOCK
assert.ok(isMockScenario('flaky') && !isMockScenario('toString'), 'RECOGNITION_MOCK check');

/** Recognises a photo with the scenario; counts the calls to the model. */
const recognize = async (scenario: MockScenario) => {
	const model = mockModel(scenario);
	let count = 0;
	const result = await recognizeItem(photo, (photo) => (count++, model(photo))).catch((error: unknown) => error);
	return { result, calls: count };
};
/** The recognised item; fails when the result is an error. */
const item = (result: unknown) => {
	assert.ok(!(result instanceof Error), `expected an item, got ${result}`);
	return result as RecognizedItem;
};

// FR-19: name, category, suitability and attributes in Lithuanian (no confidence %: the page says the AI can be wrong)
const recognizedBoots = await recognize('recognized');
assert.deepEqual(recognizedBoots, { result: parseRecognition(MOCK_RESPONSES.recognized), calls: 1 });
assert.equal(item(recognizedBoots.result).name, 'Žygio batai');
// Nothing certain to add: no attributes, nothing made up
assert.deepEqual(item((await recognize('noAttributes')).result), {
	name: 'Palapinė',
	category: 'SLEEP',
	suitability: ['WARM'],
	attributes: []
});
// Gear we have no Lithuanian name for: the user types the name, the rest is pre-filled
assert.deepEqual(item((await recognize('unknownItem')).result), {
	name: '',
	category: 'TOOLS',
	suitability: ['COLD'],
	attributes: [{ name: 'užima vietos', value: 'daug' }]
});

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
const boots = item(recognizedBoots.result);
const filled = itemFormValues(boots);
const data = new FormData();
data.set('name', filled.name);
data.set('category', filled.category);
for (const temperature of filled.suitability) data.append('suitability', temperature);
data.set('attributes', filled.attributes);
assert.deepEqual(readItemForm(data).input, boots);
// Recognising writes nothing (no DB in this script): only "Išsaugoti" on the form reaches the inventory.

// "Generuoti iš naujo": only the photo this user just had recognised, MAX_REGENERATIONS times
const upload = { bytes: new Uint8Array([1, 2, 3]) };
const other = { bytes: new Uint8Array([1, 2, 4]) };
assert.equal(takeRegeneration('ana', upload), null, 'nothing recognised yet');
assert.equal(allowRegeneration('ana', upload), MAX_REGENERATIONS);
assert.equal(MAX_REGENERATIONS, 5);
assert.equal(takeRegeneration('ana', other), null, 'another photo');
assert.equal(takeRegeneration('bob', upload), null, 'another user, same photo');
assert.deepEqual(
	Array.from({ length: MAX_REGENERATIONS + 1 }, () => takeRegeneration('ana', upload)),
	[4, 3, 2, 1, 0, null],
	'five, then no more (counted at once, so parallel requests get no extra)'
);
allowRegeneration('ana', upload);
forgetRecognition('ana'); // a new first recognition started
assert.equal(takeRegeneration('ana', upload), null, 'forgotten when a new recognition starts');
allowRegeneration('ana', upload, 0);
assert.equal(takeRegeneration('ana', upload, 31 * 60_000), null, 'expires after 30 min');
assert.equal(takeRegeneration('ana', upload, 29 * 60_000), 4);

console.log('recognition checks passed');
