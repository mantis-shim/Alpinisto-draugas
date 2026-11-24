// Self-check for photo upload checks and the WebP preview conversion (UC-3). Run: npm run check:photo
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { PHOTO_MAX_BYTES } from '#lib/domain.ts';
import { PhotoError, photoToWebp, readPhoto } from '#lib/server/photo.ts';

const blank = (width: number, height: number) =>
	sharp({ create: { width, height, channels: 3, background: '#2f5d50' } });
const file = async (image: sharp.Sharp) => new File([new Uint8Array(await image.toBuffer())], 'x');
const rejects = (input: FormDataEntryValue | null, message: RegExp) =>
	assert.rejects(photoToWebp(input), (e) => e instanceof PhotoError && message.test(e.message));

// Big PNG -> WebP, scaled down to 1024 px on the long side
const png = await photoToWebp(await file(blank(3000, 2000).png()));
assert.equal(String.fromCharCode(...png.subarray(8, 12)), 'WEBP');
const meta = await sharp(png).metadata();
assert.deepEqual([meta.format, meta.width, meta.height], ['webp', 1024, 683]);

// Sideways phone JPEG: EXIF orientation is applied, then all metadata is dropped (no GPS leaves the server)
const sideways = blank(200, 100).jpeg().withMetadata({ orientation: 6 });
const upright = await sharp(await photoToWebp(await file(sideways))).metadata();
assert.deepEqual([upright.width, upright.height], [100, 200], 'rotated upright');
assert.equal(upright.exif, undefined, 'metadata stripped');

// Small photos are not enlarged
assert.equal((await sharp(await photoToWebp(await file(blank(300, 200).png()))).metadata()).width, 300);

// Recognition gets JPG/PNG untouched (llama-server can't read WebP)
const jpeg = await file(blank(50, 40).jpeg());
assert.deepEqual(await readPhoto(jpeg), { bytes: new Uint8Array(await jpeg.arrayBuffer()), format: 'jpeg' });
assert.equal((await readPhoto(await file(blank(50, 40).png()))).format, 'png');

// Rejected uploads, each with its own message
await rejects(null, /Pasirink/);
await rejects('text field', /Pasirink/);
await rejects(new File([], 'empty.jpg'), /Pasirink/);
await rejects(new File([new Uint8Array(PHOTO_MAX_BYTES + 1)], 'big.jpg'), /per didelė/);
await rejects(await file(blank(10, 10).gif()), /formato/);
await rejects(new File(['GIF89a fake'], 'photo.jpg'), /formato/); // the file name doesn't decide the format
await rejects(new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])], 'broken.jpg'), /Nepavyko/);

console.log('photo checks passed');
