// Self-check for photo uploads, the WebP preview and the model's input (UC-3). Run: npm run check:photo
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { crc32 } from 'node:zlib';
import sharp from 'sharp';
import { PHOTO_MAX_BYTES } from '#lib/domain.ts';
import { PhotoError, photoForModel, photoToWebp, readPhoto } from '#lib/server/photo.ts';

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

// The model gets every photo re-encoded: JPG stays JPG, PNG stays PNG, small, upright, no metadata
const jpeg = await file(blank(2000, 1000).jpeg().withMetadata({ orientation: 6 }));
const jpegPhoto = await readPhoto(jpeg);
assert.deepEqual(jpegPhoto, { bytes: new Uint8Array(await jpeg.arrayBuffer()), format: 'jpeg' });
const jpegForModel = await photoForModel(jpegPhoto);
const jpegMeta = await sharp(jpegForModel.bytes).metadata();
assert.deepEqual([jpegForModel.format, jpegMeta.format, jpegMeta.width, jpegMeta.height], ['jpeg', 'jpeg', 512, 1024]);
assert.equal(jpegMeta.exif, undefined, 'no EXIF/GPS to the model device');
const pngForModel = await photoForModel(await readPhoto(await file(blank(50, 40).png())));
assert.equal(pngForModel.format, 'png');
assert.equal((await sharp(pngForModel.bytes).metadata()).format, 'png');

// A small PNG that declares a huge image never gets decoded
const bomb = Buffer.from(await blank(1, 1).png().toBuffer());
bomb.writeUInt32BE(10_000, 16); // IHDR width
bomb.writeUInt32BE(10_000, 20); // IHDR height
bomb.writeUInt32BE(crc32(bomb.subarray(12, 29)), 29);
await assert.rejects(
	photoForModel(await readPhoto(new File([bomb], 'bomb.png'))),
	(e) => e instanceof PhotoError && /pixel limit/.test(String((e.cause as Error)?.message))
);

// A 2048x1536 HEIC filled with #2f5d50 (made with pillow-heif: sharp can't write HEIC)
const heicFile = new File([await readFile(new URL('fixtures/blank.heic', import.meta.url))], 'IMG_0001.HEIC');
const heic = await readPhoto(heicFile);
assert.equal(heic.format, 'heic');
const forModel = await photoForModel(heic);
assert.equal(forModel.format, 'png');
const heicMeta = await sharp(forModel.bytes).metadata();
assert.deepEqual([heicMeta.format, heicMeta.width, heicMeta.height, heicMeta.channels], ['png', 1024, 768, 3], 'shrunk, no alpha');
const means = (await sharp(forModel.bytes).stats()).channels.map((c) => Math.round(c.mean));
means.forEach((mean, i) => assert.ok(Math.abs(mean - [0x2f, 0x5d, 0x50][i]) < 4, `colours kept: ${means}`));
assert.equal((await sharp(await photoToWebp(heicFile)).metadata()).format, 'webp', 'HEIC preview');
// Broken HEICs fail, and libheif's memory is freed each time (heic-decode leaked ~1 MB per MB uploaded).
// libheif logs "Could not parse HEIF file".
const brokenHeic = new Uint8Array(4 * 1024 * 1024);
brokenHeic.set(heic.bytes.subarray(0, 32));
const brokenUpload = () => photoForModel({ ...heic, bytes: brokenHeic });
await assert.rejects(brokenUpload(), (e) => e instanceof PhotoError);
const before = process.memoryUsage().rss;
for (let i = 0; i < 30; i++) await brokenUpload().catch(() => {});
const grownMb = (process.memoryUsage().rss - before) / 1024 / 1024;
assert.ok(grownMb < 40, `memory grew ${grownMb.toFixed(0)} MB over 30 broken HEICs`);

// Rejected uploads, each with its own message
await rejects(null, /Pasirink/);
await rejects('text field', /Pasirink/);
await rejects(new File([], 'empty.jpg'), /Pasirink/);
await rejects(new File([new Uint8Array(PHOTO_MAX_BYTES + 1)], 'big.jpg'), /per didelė/);
await rejects(await file(blank(10, 10).gif()), /formato/);
await rejects(new File(['GIF89a fake'], 'photo.jpg'), /formato/); // the file name doesn't decide the format
await rejects(new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])], 'broken.jpg'), /Nepavyko/);

console.log('photo checks passed');
