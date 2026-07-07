import type { Event, Highlight } from './types';

/**
 * Draw a 1080x1080 shareable recap card on a canvas: golf-green gradient,
 * optional photo, big caption, event branding. Returns a PNG blob ready
 * for the Web Share API or download.
 */
export async function renderShareCard(
	highlight: Highlight,
	event: Event,
	attribution: string
): Promise<Blob> {
	const size = 1080;
	const canvas = document.createElement('canvas');
	canvas.width = size;
	canvas.height = size;
	const ctx = canvas.getContext('2d')!;

	// Background: fairway-to-brew gradient
	const bg = ctx.createLinearGradient(0, 0, size, size);
	bg.addColorStop(0, '#052e16');
	bg.addColorStop(0.6, '#14532d');
	bg.addColorStop(1, '#78350f');
	ctx.fillStyle = bg;
	ctx.fillRect(0, 0, size, size);

	// Optional photo, drawn cover-style in the upper 60% with a dark overlay
	if (highlight.image_url) {
		try {
			const img = await loadImage(highlight.image_url);
			const areaH = size * 0.58;
			const scale = Math.max(size / img.width, areaH / img.height);
			const w = img.width * scale;
			const h = img.height * scale;
			ctx.save();
			ctx.beginPath();
			ctx.roundRect(40, 40, size - 80, areaH - 40, 32);
			ctx.clip();
			ctx.drawImage(img, (size - w) / 2, (areaH - h) / 2 + 20, w, h);
			ctx.fillStyle = 'rgba(5, 46, 22, 0.25)';
			ctx.fillRect(0, 0, size, areaH);
			ctx.restore();
		} catch {
			// CORS or network hiccup — the card still looks great without the photo.
		}
	}

	const textTop = highlight.image_url ? size * 0.62 : size * 0.3;

	// Hole badge
	if (highlight.hole_number) {
		ctx.fillStyle = '#fbbf24';
		ctx.font = 'bold 44px Trebuchet MS, sans-serif';
		ctx.textAlign = 'center';
		ctx.fillText(`⛳ HOLE ${highlight.hole_number}`, size / 2, textTop);
	}

	// Caption, word-wrapped
	ctx.fillStyle = '#ffffff';
	ctx.font = 'bold 64px Trebuchet MS, sans-serif';
	ctx.textAlign = 'center';
	const lines = wrapText(ctx, `“${highlight.caption}”`, size - 160);
	lines.slice(0, 4).forEach((line, i) => {
		ctx.fillText(line, size / 2, textTop + 90 + i * 78);
	});

	// Attribution + event footer
	ctx.font = '40px Trebuchet MS, sans-serif';
	ctx.fillStyle = '#fcd34d';
	ctx.fillText(`— ${attribution}`, size / 2, size - 170);
	ctx.fillStyle = 'rgba(255,255,255,0.85)';
	ctx.font = '36px Trebuchet MS, sans-serif';
	ctx.fillText(`${event.title} · ${event.course}`, size / 2, size - 110);
	ctx.fillStyle = 'rgba(255,255,255,0.6)';
	ctx.font = 'bold 32px Trebuchet MS, sans-serif';
	ctx.fillText('🍺 HOLD MY BEER SCRAMBLE ⛳', size / 2, size - 50);

	return new Promise((resolve, reject) => {
		canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Canvas export failed'))), 'image/png');
	});
}

function loadImage(url: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.crossOrigin = 'anonymous';
		img.onload = () => resolve(img);
		img.onerror = reject;
		img.src = url;
	});
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
	const words = text.split(' ');
	const lines: string[] = [];
	let current = '';
	for (const word of words) {
		const test = current ? `${current} ${word}` : word;
		if (ctx.measureText(test).width > maxWidth && current) {
			lines.push(current);
			current = word;
		} else {
			current = test;
		}
	}
	if (current) lines.push(current);
	return lines;
}

/** Share a card via the native share sheet, falling back to a download. */
export async function shareCard(blob: Blob, title: string, url: string): Promise<'shared' | 'downloaded'> {
	const file = new File([blob], 'hmb-highlight.png', { type: 'image/png' });
	if (navigator.canShare?.({ files: [file] })) {
		try {
			await navigator.share({ files: [file], title, url });
			return 'shared';
		} catch {
			// user cancelled — fall through to download
		}
	}
	const a = document.createElement('a');
	a.href = URL.createObjectURL(blob);
	a.download = 'hmb-highlight.png';
	a.click();
	URL.revokeObjectURL(a.href);
	return 'downloaded';
}
