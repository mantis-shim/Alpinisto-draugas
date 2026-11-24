// UC-3 step 1: check an uploaded photo; convert it to a small WebP for the browser preview.
// Everything happens in memory: the photo is never written to disk or the database (FR-25).
import decodeHeic from 'heic-decode';
import sharp from 'sharp';
import { PHOTO_MAX_BYTES } from '#lib/domain.ts';

// ponytail: 1024 px on the long side is enough to see what an item is, and it keeps the preview light on slow networks.
const MAX_SIDE = 1024;
// HEIC is decoded to raw pixels (4 bytes each) before sharp sees it. This caps what one upload can make us allocate (~400 MB).
const HEIC_MAX_PIXELS = 100_000_000;

/** The photo can't be used. The message is shown to the user as-is. */
export class PhotoError extends Error {}

const ascii = (bytes: Uint8Array, from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
const HEIC_BRANDS = ['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'];

/** By content, not by file name or the type the browser sends (both can lie, and HEIC often has no type at all). */
function detectFormat(bytes: Uint8Array) {
	if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
	if (ascii(bytes, 0, 8) === '\x89PNG\r\n\x1a\n') return 'png';
	if (ascii(bytes, 4, 8) === 'ftyp' && HEIC_BRANDS.includes(ascii(bytes, 8, 12))) return 'heic';
	return null;
}

// sharp's prebuilt binaries can't decode HEIC (HEVC patents), so libheif (WebAssembly) decodes it to raw pixels first.
async function heicToSharp(bytes: Uint8Array) {
	const images = await decodeHeic.all({ buffer: bytes });
	try {
		const { width, height, decode } = images[0]; // the primary image; others are burst/depth frames
		if (width * height > HEIC_MAX_PIXELS) throw new Error(`HEIC too large: ${width}x${height}`);
		const { data } = await decode();
		return sharp(data, { raw: { width, height, channels: 4 } });
	} finally {
		images.dispose();
	}
}

/** Checks one uploaded photo (JPG, PNG or HEIC, at most 10 MB, FR-16) and returns its bytes as sent. Throws PhotoError. */
export async function readPhoto(file: FormDataEntryValue | null) {
	if (!(file instanceof File) || !file.size) throw new PhotoError('Pasirink nuotrauką.');
	if (file.size > PHOTO_MAX_BYTES) throw new PhotoError('Nuotrauka per didelė. Įkelk nuotrauką iki 10 MB.');
	const bytes = new Uint8Array(await file.arrayBuffer());
	const format = detectFormat(bytes);
	if (!format) throw new PhotoError('Tokio formato nuotraukos įkelti negalima. Tinka JPG, PNG arba HEIC.');
	return { bytes, format };
}

export type Photo = Awaited<ReturnType<typeof readPhoto>>;

/**
 * readPhoto, then the photo as WebP: upright, at most MAX_SIDE px, without metadata (no GPS location leaves the server).
 * Only the browser preview uses it now: llama-server can't read WebP. Throws PhotoError.
 */
export async function photoToWebp(file: FormDataEntryValue | null) {
	const { bytes, format } = await readPhoto(file);
	try {
		const image = format === 'heic' ? await heicToSharp(bytes) : sharp(bytes);
		return await image
			.rotate() // phones save photos sideways plus an EXIF orientation flag; bake it in
			.resize(MAX_SIDE, MAX_SIDE, { fit: 'inside', withoutEnlargement: true })
			.webp({ quality: 80 })
			.toBuffer(); // sharp drops EXIF/GPS unless asked to keep it
	} catch (error) {
		throw new PhotoError('Nepavyko perskaityti nuotraukos. Gal failas sugadintas? Pabandyk kitą nuotrauką.', {
			cause: error
		});
	}
}
