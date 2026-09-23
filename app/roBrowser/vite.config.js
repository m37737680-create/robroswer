import { defineConfig } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import uiCssHmrPlugin from './vite/csshotreload.plugin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isDocker = process.env.RO_PROXY_TARGET === 'docker';
const webTarget = isDocker ? 'http://serve:80' : 'http://127.0.0.1:8888';
const remoteClientTarget = isDocker ? 'http://nginx:80' : 'http://127.0.0.1:8080';
const configuredPublicHost = process.env.CLIENT_PUBLIC_HOST || '';
const publicHostForVite = configuredPublicHost
	.replace(/^[a-z]+:\/\//i, '')
	.split('/')[0]
	.split(':')[0];

const sourceAliases = ['App', 'Audio', 'Controls', 'Core', 'DB', 'Engine', 'Loaders', 'Network', 'Plugins', 'Preferences', 'Renderer', 'UI', 'Utils', 'Vendors'];
const sourceAliasPlugin = {
	name: 'rewrite-source-aliases',
	enforce: 'pre',
	resolveId(source) {
		for (const name of sourceAliases) {
			if (source === name || source.startsWith(`${name}/`)) {
				return path.resolve(__dirname, 'src', source);
			}
		}
		return null;
	}
};

const renewalImportPathPlugin = {
	name: 'prefix-renewal-import-paths',
	enforce: 'pre',
	resolveId(source) {
		if (source.indexOf('/renewal/src/') === 0) {
			return path.resolve(__dirname, source.substring('/renewal/'.length));
		}
		if (source.indexOf('/renewal/node_modules/') === 0) {
			return path.resolve(__dirname, source.substring('/renewal/'.length));
		}
		return null;
	},
	transform(code, id) {
		if (!id.endsWith('.js')) {
			return null;
		}
		const aliases = ['App', 'Audio', 'Controls', 'Core', 'DB', 'Engine', 'Loaders', 'Network', 'Plugins', 'Preferences', 'Renderer', 'UI', 'Utils', 'Vendors'];
		const aliasPattern = aliases.join('|');
		const rewritten = code
			.replace(new RegExp(`(["'])(${aliasPattern})/`, 'g'), '$1/renewal/src/$2/')
			.replace(/(["'])bson(["'])/g, '$1/renewal/node_modules/bson/lib/bson.mjs$2')
			.replace(/(["'])lodash-es\/([^"']+)(["'])/g, '$1/renewal/node_modules/lodash-es/$2$3');
		return rewritten === code ? null : { code: rewritten, map: null };
	}
};

const _proxy = {  
	'/get': {  
		target: webTarget,  
		changeOrigin: true,  
		secure: false,  
		ws: false  
	},  
	'/emblem': {  
		target: webTarget,  
		changeOrigin: true,  
		secure: false,  
		ws: false  
	},  
	'/userconfig': {  
		target: webTarget,  
		changeOrigin: true,  
		secure: false,  
		ws: false  
	},
	'/api/': {
		target: remoteClientTarget,  
		changeOrigin: true,  
		secure: false,  
		ws: false
	}
};

if (isDocker) {
	_proxy['/remote-client'] = {
		target: remoteClientTarget,
		changeOrigin: true,
		secure: false,
		rewrite: path => path.replace(/^\/remote-client/, '')
	};
}

export default defineConfig({
	base: '/renewal/',
	plugins: [
		sourceAliasPlugin,
		renewalImportPathPlugin,
		uiCssHmrPlugin()
	],
	root: path.resolve(__dirname, '.'),
	base: './',
	resolve: {
	alias: [
		{ find: 'App', replacement: path.resolve(__dirname, './src/App') },
		{ find: 'Audio', replacement: path.resolve(__dirname, './src/Audio') },
		{ find: 'Controls', replacement: path.resolve(__dirname, './src/Controls') },
		{ find: 'Core', replacement: path.resolve(__dirname, './src/Core') },
		{ find: 'DB', replacement: path.resolve(__dirname, './src/DB') },
		{ find: 'Engine', replacement: path.resolve(__dirname, './src/Engine') },
		{ find: 'Loaders', replacement: path.resolve(__dirname, './src/Loaders') },
		{ find: 'Network', replacement: path.resolve(__dirname, './src/Network') },
		{ find: 'Plugins', replacement: path.resolve(__dirname, './src/Plugins') },
		{ find: 'Preferences', replacement: path.resolve(__dirname, './src/Preferences') },
		{ find: 'Renderer', replacement: path.resolve(__dirname, './src/Renderer') },
		{ find: 'UI', replacement: path.resolve(__dirname, './src/UI') },
		{ find: 'Utils', replacement: path.resolve(__dirname, './src/Utils') },
		{ find: 'Vendors', replacement: path.resolve(__dirname, './src/Vendors') }
	]
	},
	optimizeDeps: {  
		include: ['bson', 'lodash', 'rijndael-js']  
	},
	test: {
		environment: 'jsdom',
		include: ['tests/**/*.test.js'],
		coverage: {  
			provider: 'v8',  
			reporter: ['text', 'html'],  
			include: ['src/**/*.js'],  
			exclude: ['src/Vendors/**']  
		}
	},
	build: {
		sourcemap: false, // Saves RAM
		minify: false, // Makes the build run much faster
		outDir: 'dist/Web',
		rollupOptions: {
			input: {
				main: path.resolve(__dirname, 'index.html')
			}
		}
	},
	server: {
		host: isDocker ? '0.0.0.0' : 'localhost', 
		port: 3000,
		open: !isDocker,
		cors: true,  
		...(isDocker && { hmr: false }),
		...(isDocker && {  
			watch: {  
				usePolling: true, 
				interval: 1000  
			}  
		}),
		proxy: _proxy
	},
	preview: {
		host: isDocker ? '0.0.0.0' : 'localhost',
		allowedHosts: publicHostForVite ? [publicHostForVite] : []
	}
});
