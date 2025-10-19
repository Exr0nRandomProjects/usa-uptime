import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter({
			pages: 'build',
			assets: 'build',
			// strict: false,
		}),
		prerender: {
			// pre-render all pages
			crawl: true,
			entries: ['*', '/']
		}
	}
};

export default config;
