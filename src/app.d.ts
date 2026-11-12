// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {
		interface Locals {
			/** Set by the `handle` hook from the session cookie; null when logged out. */
			user: { id: string; email: string } | null;
		}
	}
}

export {};
