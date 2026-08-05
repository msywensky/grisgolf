// Client-side photo downscale, so an 8-12MB phone photo doesn't waste
// bandwidth or vision tokens before it's sent to the backend as base64 JSON.

export interface DownscaledImage {
	base64: string; // no "data:...;base64," prefix
	mediaType: string;
}

/** Long-edge-capped JPEG re-encode of a local image file. */
export async function downscaleToDataUrl(file: File, maxEdge: number): Promise<DownscaledImage> {
	const img = await loadImageFromFile(file);
	const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
	const w = Math.round(img.width * scale);
	const h = Math.round(img.height * scale);

	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext('2d')!;
	ctx.drawImage(img, 0, 0, w, h);

	const blob = await new Promise<Blob>((resolve, reject) => {
		canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas export failed'))), 'image/jpeg', 0.85);
	});
	return { base64: await blobToBase64(blob), mediaType: 'image/jpeg' };
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const url = URL.createObjectURL(file);
		const img = new Image();
		img.onload = () => {
			URL.revokeObjectURL(url);
			resolve(img);
		};
		img.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new Error('Could not read that image'));
		};
		img.src = url;
	});
}

function blobToBase64(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			const result = reader.result as string;
			resolve(result.slice(result.indexOf(',') + 1));
		};
		reader.onerror = () => reject(new Error('Could not encode that image'));
		reader.readAsDataURL(blob);
	});
}
