// Environment variables (SvelteKit 3). Checked when the app starts; import them from '$app/env/private'.
// Add new variables here and to .env.example (without values).
import { defineEnvVars } from '@sveltejs/kit/env';
import { MOCK_RESPONSES, isMockScenario, type MockScenario } from '#lib/server/llama_api/recognition-mocks.ts';
import {
	MOCK_SCENARIOS as RECOMMENDATION_MOCKS,
	isMockScenario as isRecommendationMock,
	type MockScenario as RecommendationMock
} from '#lib/server/gemini/recommendation-format.ts';

export const variables = defineEnvVars({
	MONGODB_URI: {
		description: 'MongoDB connection string. compose.yaml sets it inside Docker.',
		schema: (value) => {
			if (!value) throw new Error('MONGODB_URI is not set (see .env.example)');
			return value;
		}
	},
	// Optional, so the app starts without the model; recognising a photo then shows an error (UC-3).
	LLAMA_URL: {
		description: 'llama-server (OpenAI-compatible API) on the separate model device, e.g. http://192.168.1.50:8080',
		schema: (value) => value || undefined
	},
	LLAMA_API_KEY: {
		description: "llama-server's --api-key. Required whenever llama-server is reachable over a network.",
		schema: (value) => value || undefined
	},
	// UC-3 without the model device: every photo gets a canned reply (src/lib/server/llama_api/recognition-mocks.ts)
	RECOGNITION_MOCK: {
		description: `Mock item recognition instead of llama-server: ${Object.keys(MOCK_RESPONSES).join(', ')}`,
		schema: (value) => {
			if (value && !isMockScenario(value)) throw new Error(`RECOGNITION_MOCK must be one of: ${Object.keys(MOCK_RESPONSES).join(', ')}`);
			return (value || undefined) as MockScenario | undefined;
		}
	},
	// Optional, so the app starts without it; "Generuoti rekomendacijas" then says generation is off (UC-7).
	GEMINI_API_KEY: {
		description: 'Google Gemini API key for hike recommendations (UC-7), from aistudio.google.com. Server side only.',
		schema: (value) => value || undefined
	},
	GEMINI_MODEL: {
		description: 'Gemini model for recommendations. Empty: gemini-flash-latest.',
		schema: (value) => value || undefined
	},
	// UC-7 without an API key: canned recommendations (src/lib/server/gemini/recommendation-format.ts)
	RECOMMENDATIONS_MOCK: {
		description: `Mock recommendations instead of Gemini: ${RECOMMENDATION_MOCKS.join(', ')}`,
		schema: (value) => {
			if (value && !isRecommendationMock(value)) {
				throw new Error(`RECOMMENDATIONS_MOCK must be one of: ${RECOMMENDATION_MOCKS.join(', ')}`);
			}
			return (value || undefined) as RecommendationMock | undefined;
		}
	}
});
