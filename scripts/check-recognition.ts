// Self-check for item recognition (UC-3): request body, answer checks, error mapping, retries, every mock scenario,
// the form pre-fill and who may regenerate. Run: npm run check:recognition
// No network: the llama-server client gets a stubbed fetch, the rest uses the mocks the app plays (RECOGNITION_MOCK).
// Test against a real llama-server by hand.
import assert from 'node:assert/strict';
import { ITEM_CATEGORIES, RECOGNITION_CHECK_BELOW } from '#lib/domain.ts';
import { MOCK_RESPONSES, isMockScenario, mockModel, type MockScenario } from '#lib/server/llama_api/recognition-mocks.ts';
import {
	MAX_ATTEMPTS,
	MAX_REGENERATIONS,
	PHOTO_VERDICTS,
	PHOTO_PROBLEM_TIPS,
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

// Request: OpenAI chat format, the JPG/PNG photo in a data URL (HEIC arrives here already as PNG), the answer
// constrained by a JSON schema
const photo = { bytes: new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]), format: 'jpeg' as const };
const imageUrl = (format: 'jpeg' | 'png') =>
	(recognitionRequest({ ...photo, format }).messages[1].content[0] as { image_url: { url: string } }).image_url.url;
assert.equal(imageUrl('jpeg'), `data:image/jpeg;base64,${Buffer.from(photo.bytes).toString('base64')}`);
assert.ok(imageUrl('png').startsWith('data:image/png;base64,'));
const schema = recognitionRequest(photo).response_format.json_schema.schema;
assert.deepEqual(schema.properties.category.enum, ITEM_CATEGORIES);
assert.equal(Object.keys(schema.properties)[0], 'photo', 'the photo is judged before the item is named');
assert.ok(schema.properties.item.enum.includes('other') && schema.properties.colour.enum.includes('unclear'));
// Regenerating: the very same messages (llama-server reuses the processed photo), only a higher temperature
const regenerated = recognitionRequest(photo, true);
assert.deepEqual(regenerated.messages, recognitionRequest(photo).messages);
assert.ok(regenerated.temperature > recognitionRequest(photo).temperature && regenerated.cache_prompt);
const regenerateSchema = regenerated.response_format.json_schema.schema;
assert.deepEqual(regenerateSchema.properties.photo.enum, ['OK'], 'the photo was usable');
assert.ok(!regenerateSchema.properties.item.enum.includes('other'), 'a regeneration never empties the name');
assert.equal(schema.properties.photo.enum, PHOTO_VERDICTS, 'the first request still judges the photo');

// Answers: the model picks English options, the app writes them in Lithuanian
const answer = (fields: object) =>
	JSON.stringify({ photo: 'OK', item: 'hiking boots', category: 'FOOTWEAR', colour: 'brown', material: 'leather', confidence: 85, ...fields });
/** The recognised item; fails when the result is a photo problem or an error. */
const item = (result: unknown) => {
	assert.ok(result && typeof result === 'object' && 'confidence' in result, `expected an item, got ${result}`);
	return result as RecognizedItem;
};
const parsed = (fields: object) => item(parseRecognition(answer(fields)));

assert.deepEqual(parsed({}), {
	name: 'Žygio batai',
	category: 'FOOTWEAR',
	attributes: [
		{ name: 'spalva', value: 'ruda' },
		{ name: 'medžiaga', value: 'oda' }
	],
	confidence: 85
});
assert.equal(parsed({ item: 'headlamp', category: 'NAVIGATION' }).category, 'TOOLS', 'a known item has its own category');
assert.deepEqual(parsed({ colour: 'unclear', material: 'unclear' }).attributes, [], '"unclear" adds nothing');
assert.deepEqual(parsed({ colour: 'žalia', material: 'toString' }).attributes, [], 'only offered options, nothing inherited');
assert.deepEqual(
	[parsed({ item: 'other', category: 'TOOLS' }), parsed({ item: 'helmet', category: 'SHOES' }), parsed({ item: 'toString' })].map(
		({ name, category }) => [name, category]
	),
	[['', 'TOOLS'], ['', 'OTHER'], ['', 'FOOTWEAR']],
	"other or unknown: no name (the user types it), the model's category only if it is real"
);
// The model says the photo can't be used: that reason, whatever else it wrote; each one has a tip for the user
for (const problem of ['BLURRY', 'TOO_DARK', 'SEVERAL_ITEMS', 'NO_GEAR'] as const) {
	assert.equal(parseRecognition(answer({ photo: problem })), problem);
}
assert.deepEqual(PHOTO_VERDICTS.slice(1).toSorted(), Object.keys(PHOTO_PROBLEM_TIPS).toSorted(), 'a tip for every problem');
assert.throws(() => parseRecognition(answer({ photo: 'BAD' })), RecognitionError, 'unknown verdict = broken');
assert.throws(() => parseRecognition(answer({ photo: undefined })), RecognitionError, 'no verdict = broken');
assert.throws(() => parseRecognition('null'), RecognitionError);
assert.throws(() => parseRecognition('not json'), RecognitionError);
assert.equal(parsed({ confidence: 140 }).confidence, 100);
assert.equal(parsed({ confidence: -3 }).confidence, 0);
assert.equal(parsed({ confidence: 'high' }).confidence, 0, 'missing confidence -> "Patikrinkite"');

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
assert.equal(item(await recognizeItem(photo, llama)).name, 'Žygio batai');
assert.equal(calls[0].url, 'http://model-box:8080/v1/chat/completions', 'trailing slash handled');
assert.equal((calls[0].init.headers as Record<string, string>).authorization, 'Bearer secret');
assert.ok(calls[0].init.signal instanceof AbortSignal, 'request has a timeout');
await recognizeItem(photo, llama, true);
assert.equal(JSON.parse(String(calls[1].init.body)).temperature, regenerated.temperature, 'regeneration reaches the model');

stub(() => reply(answer({}), 'length'));
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
stub(() => (calls.length === 1 ? Promise.reject(new TypeError('fetch failed')) : reply(answer({}))));
assert.equal(item(await recognizeItem(photo, llama)).name, 'Žygio batai', 'dropped connection, the retry works');
stub(() => Promise.reject(new DOMException('timed out', 'TimeoutError')));
await assert.rejects(recognizeItem(photo, llama), failsWith(/per ilgai/), 'timeout has its own message');
assert.equal(calls.length, 1, 'a timeout is not retried (another 30 s)');
await assert.rejects(recognizeItem(photo, llamaModel({})), failsWith(/Nepavyko/), 'LLAMA_URL not set');

// Mock scenarios: the same objects the app plays with RECOGNITION_MOCK
for (const response of Object.values(MOCK_RESPONSES).flat()) {
	if (typeof response !== 'object' || response instanceof Error) continue;
	assert.deepEqual(Object.keys(response).sort(), [...schema.required].sort(), 'mock answers follow the contract');
}
assert.ok(isMockScenario('flaky') && !isMockScenario('toString'), 'RECOGNITION_MOCK check');

/** Recognises a photo with the scenario; counts the calls to the model. */
const recognize = async (scenario: MockScenario) => {
	const model = mockModel(scenario);
	let count = 0;
	const result = await recognizeItem(photo, (photo) => (count++, model(photo))).catch((error: unknown) => error);
	return { result, calls: count };
};

// FR-19/FR-20: the item with its confidence; the 70 % threshold
const confident = await recognize('confident');
assert.deepEqual(item(confident.result), {
	name: 'Žygio batai',
	category: 'FOOTWEAR',
	attributes: [
		{ name: 'spalva', value: 'ruda' },
		{ name: 'medžiaga', value: 'oda' }
	],
	confidence: 92
});
const needsCheck = (result: unknown) => item(result).confidence < RECOGNITION_CHECK_BELOW; // the page's test
assert.equal(needsCheck(confident.result), false, '92 %: no "Patikrinkite"');
assert.equal(needsCheck((await recognize('threshold')).result), false, 'exactly 70 %: no tag');
assert.equal(needsCheck((await recognize('lowConfidence')).result), true, '69 %: "Patikrinkite"');

// Some attributes missing: only what the model saw is filled in, nothing is made up
const missing = item((await recognize('missingAttributes')).result);
assert.deepEqual(missing.attributes, [{ name: 'spalva', value: 'ruda' }]);
// Gear the model has no name for: the user types the name, the rest is pre-filled
assert.deepEqual(item((await recognize('unknownItem')).result), {
	name: '',
	category: 'TOOLS',
	attributes: [
		{ name: 'spalva', value: 'raudona' },
		{ name: 'medžiaga', value: 'metalas' }
	],
	confidence: 60
});

// FR-21: the model can't use the photo -> the reason (the page shows its tip, a better photo or the manual form)
assert.deepEqual(await recognize('notRecognized'), { result: 'NO_GEAR', calls: 1 });
assert.deepEqual(await recognize('blurry'), { result: 'BLURRY', calls: 1 });

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
