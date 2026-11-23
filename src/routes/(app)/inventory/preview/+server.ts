// FR-17: preview for photos the browser can't show itself (HEIC outside Safari). Returns the same WebP the model gets.
// Nothing is stored (FR-25).
import { requireUser } from '#lib/server/auth.ts';
import { PhotoError, photoToWebp } from '#lib/server/photo.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, request }) => {
	requireUser(locals);
	try {
		const webp = await photoToWebp((await request.formData()).get('photo'));
		return new Response(new Uint8Array(webp), { headers: { 'content-type': 'image/webp', 'cache-control': 'no-store' } });
	} catch (error) {
		// the message is Lithuanian and meant for the user
		if (error instanceof PhotoError) return new Response(error.message, { status: 400 });
		throw error;
	}
};
