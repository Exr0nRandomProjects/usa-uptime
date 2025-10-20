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
			entries: ['*', '/'],
			handleHttpError: ({ path, referrer, message }) => {
				// 503 errors on /down are expected and valid
				if (path === '/down' && message.includes('503')) {
					return;
				}
				// Throw an error for other cases
				throw new Error(message);
			}
		}
	}
};

export default config;
