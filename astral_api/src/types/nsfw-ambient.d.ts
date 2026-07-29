declare module 'nsfwjs' {
	export interface NSFWJS {
		classify(image: HTMLImageElement | unknown, topk?: number): Promise<Array<{className: string; probability: number}>>;
	}
	export function load(modelUrl?: string, options?: {size?: number}): Promise<NSFWJS>;
}

declare module '@tensorflow/tfjs-node' {
	export interface Tensor3D {
		dispose(): void;
	}
	export namespace node {
		function decodeImage(buffer: Buffer, channels?: number): Tensor3D;
	}
}
