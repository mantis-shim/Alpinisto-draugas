// Environment variables (SvelteKit 3). Checked when the app starts; import them from '$app/env/private'.
// Add new variables here and to .env.example (without values).
import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	MONGODB_URI: {
		description: 'MongoDB connection string. compose.yaml sets it inside Docker.',
		schema: (value) => {
			if (!value) throw new Error('MONGODB_URI is not set (see .env.example)');
			return value;
		}
	}
});
