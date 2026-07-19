// Pure helpers for real-course data (linked from GolfCourseAPI via the backend).
import type { Course, TeeBox, TeeGender } from './types';
import type { CourseResult } from './api';

/** Same display rule the backend uses: 'Club' or 'Club — Course No. 2'. */
export function courseDisplayName(c: { club_name: string; course_name: string }): string {
	const club = c.club_name.trim();
	const course = c.course_name.trim();
	if (!course || course.toLowerCase() === club.toLowerCase()) return club || course;
	return `${club} — ${course}`;
}

/** Driving-directions URL (Google Maps works on both iOS and Android), or null. */
export function directionsUrl(course: Course | null): string | null {
	if (!course) return null;
	if (course.latitude != null && course.longitude != null) {
		return `https://www.google.com/maps/dir/?api=1&destination=${course.latitude},${course.longitude}`;
	}
	const where = course.address || [course.city, course.state].filter(Boolean).join(', ');
	return where ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(where)}` : null;
}

export interface TeeOption {
	gender: TeeGender;
	tee: TeeBox;
}

/** Flatten a course's male/female tee sets into one labeled list. */
export function teeOptions(c: { tees: CourseResult['tees'] }): TeeOption[] {
	return [
		...(c.tees.male ?? []).map((tee) => ({ gender: 'male' as const, tee })),
		...(c.tees.female ?? []).map((tee) => ({ gender: 'female' as const, tee }))
	];
}

/**
 * Per-hole pars for the event's tee, or null when we can't say for sure
 * (no linked tee, missing hole data, or a hole-count mismatch) — hide pars
 * rather than show wrong ones.
 */
export function holePars(
	course: Course | null,
	teeName: string | null,
	teeGender: TeeGender | null,
	holes: number
): number[] | null {
	if (!course || !teeName || !teeGender) return null;
	const tee = (course.tees[teeGender] ?? []).find((t) => t.tee_name === teeName);
	if (!tee?.holes || tee.holes.length < holes) return null;
	const pars = tee.holes.slice(0, holes).map((h) => h.par);
	return pars.every((p) => p > 0) ? pars : null;
}

export const US_STATES: { code: string; name: string }[] = [
	{ code: 'AL', name: 'Alabama' },
	{ code: 'AK', name: 'Alaska' },
	{ code: 'AZ', name: 'Arizona' },
	{ code: 'AR', name: 'Arkansas' },
	{ code: 'CA', name: 'California' },
	{ code: 'CO', name: 'Colorado' },
	{ code: 'CT', name: 'Connecticut' },
	{ code: 'DE', name: 'Delaware' },
	{ code: 'DC', name: 'District of Columbia' },
	{ code: 'FL', name: 'Florida' },
	{ code: 'GA', name: 'Georgia' },
	{ code: 'HI', name: 'Hawaii' },
	{ code: 'ID', name: 'Idaho' },
	{ code: 'IL', name: 'Illinois' },
	{ code: 'IN', name: 'Indiana' },
	{ code: 'IA', name: 'Iowa' },
	{ code: 'KS', name: 'Kansas' },
	{ code: 'KY', name: 'Kentucky' },
	{ code: 'LA', name: 'Louisiana' },
	{ code: 'ME', name: 'Maine' },
	{ code: 'MD', name: 'Maryland' },
	{ code: 'MA', name: 'Massachusetts' },
	{ code: 'MI', name: 'Michigan' },
	{ code: 'MN', name: 'Minnesota' },
	{ code: 'MS', name: 'Mississippi' },
	{ code: 'MO', name: 'Missouri' },
	{ code: 'MT', name: 'Montana' },
	{ code: 'NE', name: 'Nebraska' },
	{ code: 'NV', name: 'Nevada' },
	{ code: 'NH', name: 'New Hampshire' },
	{ code: 'NJ', name: 'New Jersey' },
	{ code: 'NM', name: 'New Mexico' },
	{ code: 'NY', name: 'New York' },
	{ code: 'NC', name: 'North Carolina' },
	{ code: 'ND', name: 'North Dakota' },
	{ code: 'OH', name: 'Ohio' },
	{ code: 'OK', name: 'Oklahoma' },
	{ code: 'OR', name: 'Oregon' },
	{ code: 'PA', name: 'Pennsylvania' },
	{ code: 'RI', name: 'Rhode Island' },
	{ code: 'SC', name: 'South Carolina' },
	{ code: 'SD', name: 'South Dakota' },
	{ code: 'TN', name: 'Tennessee' },
	{ code: 'TX', name: 'Texas' },
	{ code: 'UT', name: 'Utah' },
	{ code: 'VT', name: 'Vermont' },
	{ code: 'VA', name: 'Virginia' },
	{ code: 'WA', name: 'Washington' },
	{ code: 'WV', name: 'West Virginia' },
	{ code: 'WI', name: 'Wisconsin' },
	{ code: 'WY', name: 'Wyoming' }
];
