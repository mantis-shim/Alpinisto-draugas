// Canned replies, one per branch of the UC-3 flow: RECOGNITION_MOCK=<scenario>, tested by check-recognition.
// Replies are text in the format the model device's grammar (gear.gbnf) allows, see recognition.ts.
import { ModelUnavailable, type RecognitionModel } from '#lib/server/llama_api/recognition.ts';

type MockResponse = string | Error;

const boots = 'Hiking boots\nCategory: Footwear\nSuitability: COLD, Warm\nAttributes:\nwaterproof = yes\nankle_support = high\n';
const down = new ModelUnavailable('llama-server unreachable', { cause: new TypeError('fetch failed') });

export const MOCK_RESPONSES = {
	recognized: boots,
	noAttributes: 'Tent\nCategory: Sleep\nSuitability: Warm\nAttributes:\n',
	unknownItem: 'Ice axe\nCategory: Tools\nSuitability: COLD\nAttributes:\npack_volume = bulky\n',
	invalid: 'Nuotraukoje matau rudus žygio batus.',
	timeout: new DOMException('The operation was aborted due to timeout', 'TimeoutError'),
	unreachable: down,
	flaky: [down, boots]
} satisfies Record<string, MockResponse | MockResponse[]>;

export type MockScenario = keyof typeof MOCK_RESPONSES;

export const isMockScenario = (name: string): name is MockScenario => Object.hasOwn(MOCK_RESPONSES, name);

export function mockModel(scenario: MockScenario): RecognitionModel {
	const responses: MockResponse[] = [MOCK_RESPONSES[scenario]].flat();
	let calls = 0;
	return async () => {
		const response = responses[calls++ % responses.length];
		if (response instanceof Error) throw response;
		return response;
	};
}
