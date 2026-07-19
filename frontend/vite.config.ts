import { execSync } from 'node:child_process';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

/**
 * Revision = highest merged-PR number found in "Merge pull request #N"
 * commit messages, so 1.0.x climbs automatically as PRs land on main —
 * no version bump commit required (which branch protection on main would
 * block anyway).
 */
function appVersion(): string {
	try {
		const subjects = execSync('git log --merges --pretty=%s', { cwd: __dirname })
			.toString()
			.split('\n');
		const prNumbers = subjects
			.map((line) => line.match(/Merge pull request #(\d+)/)?.[1])
			.filter((n): n is string => Boolean(n))
			.map(Number);
		const revision = prNumbers.length > 0 ? Math.max(...prNumbers) : 0;
		return `1.0.${revision}`;
	} catch {
		return '1.0.0';
	}
}

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	define: {
		__APP_VERSION__: JSON.stringify(appVersion())
	}
});
