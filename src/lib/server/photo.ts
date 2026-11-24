// UC-3: check an uploaded photo and re-encode it for the browser preview and the model. In memory only (FR-25).
import libheif, { type HeifImage } from 'libheif-js/wasm-bundle.js';
import sharp from 'sharp';
import { PHOTO_MAX_BYTES } from '#lib/domain.ts';

const MAX_SIDE = 1024;
// A small file can declare a huge image. 48 MP phone photos still fit.
const MAX_PIXELS = 50_000_000;

/** Its message is shown to the user. */
export class PhotoError extends Error {}

const ascii = (bytes: Uint8Array, from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
const HEIC_BRANDS = ['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'];

function detectFormat(bytes: Uint8Array): 'jpeg' | 'png' | 'heic' | null {
	if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
	if (ascii(bytes, 0, 8) === '\x89PNG\r\n\x1a\n') return 'png';
	if (ascii(bytes, 4, 8) === 'ftyp' && HEIC_BRANDS.includes(ascii(bytes, 8, 12))) return 'heic';
	return null;
}

// sharp's prebuilt binaries can't read HEIC. libheif is called directly, not through heic-decode, which leaks
// libheif's memory on files it can't parse.
async function heicToSharp(bytes: Uint8Array) {
	await libheif.ready;
	const decoder = new libheif.HeifDecoder();
	let images: HeifImage[] = [];
	try {
		images = decoder.decode(bytes);
		if (!images[0]) throw new Error('no HEIF image');
		const width = images[0].get_width();
		const height = images[0].get_height();
		if (width * height > MAX_PIXELS) throw new Error(`HEIC too large: ${width}x${height}`);
		const data = new Uint8ClampedArray(width * height * 4);
		await new Promise((resolve, reject) =>
			images[0].display({ data, width, height }, (done) => (done ? resolve(done) : reject(new Error('HEIF decoding failed'))))
		);
		return sharp(data, { raw: { width, height, channels: 4 } });
	} finally {
		for (const image of images) image.free();
		decoder.decoder?.delete();
	}
}

/** JPG, PNG or HEIC up to 10 MB (FR-16), checked by content. */
export async function readPhoto(file: FormDataEntryValue | null) {
	if (!(file instanceof File) || !file.size) throw new PhotoError('Pasirink nuotrauką.');
	if (file.size > PHOTO_MAX_BYTES) throw new PhotoError('Nuotrauka per didelė. Įkelk nuotrauką iki 10 MB.');
	const bytes = new Uint8Array(await file.arrayBuffer());
	const format = detectFormat(bytes);
	if (!format) throw new PhotoError('Tokio formato nuotraukos įkelti negalima. Tinka JPG, PNG arba HEIC.');
	return { bytes, format };
}

export type Photo = Awaited<ReturnType<typeof readPhoto>>;
/** llama-server reads only JPG and PNG. */
export type ModelPhoto = Photo & { format: 'jpeg' | 'png' };

/** Upright, at most MAX_SIDE px, without metadata (no GPS). */
async function convert({ bytes, format }: Photo, to: 'webp' | 'png' | 'jpeg') {
	try {
		const image = format === 'heic' ? await heicToSharp(bytes) : sharp(bytes, { limitInputPixels: MAX_PIXELS });
		image.rotate().resize(MAX_SIDE, MAX_SIDE, { fit: 'inside', withoutEnlargement: true });
		const encoded =
			to === 'webp'
				? image.webp({ quality: 80 })
				: to === 'png'
					? image.flatten({ background: '#ffffff' }).png()
					: image.jpeg({ quality: 90 });
		return await encoded.toBuffer();
	} catch (error) {
		throw new PhotoError('Nepavyko perskaityti nuotraukos. Gal failas sugadintas? Pabandyk kitą nuotrauką.', {
			cause: error
		});
	}
}

export const photoToWebp = async (file: FormDataEntryValue | null) => convert(await readPhoto(file), 'webp');

/** JPG stays JPG, PNG and HEIC become PNG. Always re-encoded, so no uploaded file reaches the model device as is. */
export async function photoForModel(photo: Photo): Promise<ModelPhoto> {
	const format = photo.format === 'jpeg' ? 'jpeg' : 'png';
	return { bytes: new Uint8Array(await convert(photo, format)), format };
}
