// heic-decode ships no types. Only what photo.ts uses.
declare module 'heic-decode' {
	type Pixels = { width: number; height: number; data: Uint8ClampedArray };
	type Image = { width: number; height: number; decode(): Promise<Pixels> };
	const decodeHeic: ((input: { buffer: Uint8Array }) => Promise<Pixels>) & {
		all(input: { buffer: Uint8Array }): Promise<Image[] & { dispose(): void }>;
	};
	export default decodeHeic;
}
