// Canned replies, one per branch of the UC-3 flow: RECOGNITION_MOCK=<scenario>, tested by check-recognition.
import { ModelUnavailable, type ModelAnswer, type RecognitionModel } from '#lib/server/llama_api/recognition.ts';

type MockResponse = ModelAnswer | string | Error;

const boots: ModelAnswer = {
	photo: 'OK',
	item: 'hiking boots',
	category: 'FOOTWEAR',
	colour: 'brown',
	material: 'leather',
	confidence: 92
};
const badPhoto = { item: 'other', category: 'OTHER', colour: 'unclear', material: 'unclear', confidence: 0 } as const;
const down = new ModelUnavailable('llama-server unreachable', { cause: new TypeError('fetch failed') });

export const MOCK_RESPONSES = {
	confident: boots,
	threshold: { ...boots, confidence: 70 },
	lowConfidence: { ...boots, confidence: 69 },
	missingAttributes: { ...boots, material: 'unclear', confidence: 81 },
	unknownItem: { ...boots, item: 'other', category: 'TOOLS', colour: 'red', material: 'metal', confidence: 60 },
	notRecognized: { ...badPhoto, photo: 'NO_GEAR' },
	blurry: { ...badPhoto, photo: 'BLURRY' },
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
		return typeof response === 'string' ? response : JSON.stringify(response);
	};
}
