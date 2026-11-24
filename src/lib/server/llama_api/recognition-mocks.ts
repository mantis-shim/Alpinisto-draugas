// Canned model replies for UC-3, one per branch of the recognition flow, so it works and is tested without llama-server.
// The app plays one with RECOGNITION_MOCK=<scenario> (src/env.ts); scripts/check-recognition.ts tests the same objects.
import { ModelUnavailable, type ModelAnswer, type RecognitionModel } from '#lib/server/llama_api/recognition.ts';

/** One reply: the model's answer, raw text that isn't a valid answer, or the error the call fails with. */
type MockResponse = ModelAnswer | string | Error;

const boots: ModelAnswer = {
	recognized: true,
	name: 'Žygio batai',
	category: 'FOOTWEAR',
	attributes: [
		{ name: 'spalva', value: 'ruda' },
		{ name: 'medžiaga', value: 'oda' },
		{ name: 'svoris', value: '1,2 kg' },
		{ name: 'neperšlampamas', value: '' }
	],
	confidence: 92
};
const down = new ModelUnavailable('llama-server unreachable', { cause: new TypeError('fetch failed') });

export const MOCK_RESPONSES = {
	/** ≥ 70 %: no "Patikrinkite" tag */
	confident: boots,
	/** exactly 70 %: still no tag (only < 70 gets it) */
	threshold: { ...boots, confidence: 70 },
	/** 69 %: tagged "Patikrinkite" (FR-20) */
	lowConfidence: { ...boots, confidence: 69 },
	/** recognised, but only the colour shows in the photo: no weight or material to review */
	missingAttributes: { ...boots, attributes: [{ name: 'spalva', value: 'ruda' }], confidence: 81 },
	/** no single clear item: photo tip and add by hand (FR-21) */
	notRecognized: { recognized: false, name: '', category: 'OTHER', attributes: [], confidence: 0 },
	/** prose instead of JSON: fails the answer checks, not retried */
	invalid: 'Nuotraukoje matau rudus žygio batus.',
	/** every call times out: not retried automatically (another 30 s), the user gets "Bandyti dar kartą" */
	timeout: new DOMException('The operation was aborted due to timeout', 'TimeoutError'),
	/** the model device can't be reached, every time: retried, then given up */
	unreachable: down,
	/** the first call can't reach the device and the retry succeeds (a list plays in turns) */
	flaky: [down, boots]
} satisfies Record<string, MockResponse | MockResponse[]>;

export type MockScenario = keyof typeof MOCK_RESPONSES;

export const isMockScenario = (name: string): name is MockScenario => Object.hasOwn(MOCK_RESPONSES, name);

/** Stands in for llamaModel: replies with the scenario's responses in turn. */
export function mockModel(scenario: MockScenario): RecognitionModel {
	const responses: MockResponse[] = [MOCK_RESPONSES[scenario]].flat();
	let calls = 0;
	return async () => {
		const response = responses[calls++ % responses.length];
		if (response instanceof Error) throw response;
		return typeof response === 'string' ? response : JSON.stringify(response);
	};
}
