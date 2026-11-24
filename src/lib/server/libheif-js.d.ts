// libheif-js ships no types for its bundle. Only what photo.ts uses.
declare module 'libheif-js/wasm-bundle.js' {
	export type HeifImage = {
		get_width(): number;
		get_height(): number;
		display(target: { data: Uint8ClampedArray; width: number; height: number }, done: (result: unknown) => void): void;
		free(): void;
	};
	const libheif: {
		ready?: Promise<void>;
		HeifDecoder: new () => { decoder: { delete(): void } | null; decode(bytes: Uint8Array): HeifImage[] };
	};
	export default libheif;
}
