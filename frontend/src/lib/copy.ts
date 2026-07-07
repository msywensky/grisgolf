// All the beer-and-bogeys flavor text lives here so the vibe stays consistent.

const ADJECTIVES = [
	'Hoppy',
	'Foamy',
	'Shanked',
	'Lukewarm',
	'Draft',
	'Sandy',
	'Chunky',
	'Malted',
	'Mulligan',
	'Lipped-Out',
	'Frosty',
	'Cart Path'
];

const NOUNS = [
	'Bogeys',
	'Lagers',
	'Shotgunners',
	'Slicers',
	'Pilsners',
	'Duffers',
	'Tallboys',
	'Divots',
	'Mulligans',
	'Sandbaggers',
	'Chili Dippers',
	'Three-Putts'
];

export function randomTeamName(): string {
	const a = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
	const n = NOUNS[Math.floor(Math.random() * NOUNS.length)];
	return `The ${a} ${n}`;
}

export const LOADING_LINES = [
	'Chilling the coolers…',
	'Waking up the cart girl…',
	'Looking for your ball in the woods…',
	'Repairing ball marks (someone has to)…',
	'Shotgunning the start…'
];

export function randomLoadingLine(): string {
	return LOADING_LINES[Math.floor(Math.random() * LOADING_LINES.length)];
}

export const NOTE_CHIPS = [
	'Hero par save 🦸',
	'Sandy! 🏖️',
	'Drained a bomb 🎯',
	'Cart path bounce 🛞',
	'Beer-in-hand putt 🍺',
	'Total team collapse 📉'
];

export const HIGHLIGHT_PROMPTS = [
	'What just happened out there?',
	'Describe the glory (or the carnage)…',
	'Future you wants to remember this…'
];

export function randomHighlightPrompt(): string {
	return HIGHLIGHT_PROMPTS[Math.floor(Math.random() * HIGHLIGHT_PROMPTS.length)];
}
