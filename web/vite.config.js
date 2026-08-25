import { resolve } from 'node:path';
import { defineConfig } from 'vite';

import { ensureCert } from './tools/dev-cert.mjs';

/*
 * `npm run dev:lan` sets this, and it is the difference between the board drawing
 * on your phone and not.
 *
 * WebGPU is only exposed in a secure context. http://localhost is one by
 * exemption; http://192.168.1.x — the address you need to reach this machine from
 * another device — is not, so `navigator.gpu` comes back undefined and the page
 * quite reasonably says it cannot draw. Serving the same files over HTTPS fixes it
 * with no browser flags, which matters because flags do not survive: Chrome
 * expires them, resets clear them, and the one for this names a single origin that
 * stops matching the day your router hands out a different address.
 */
const lan = process.env.CHETACTOE_HTTPS === '1';
const https = lan ? ensureCert() : null;

// Six pages, so they all have to be named — a default build would only pick up
// index.html and quietly drop the playground, the rules, the pieces viewer and
// the comparison page.
export default defineConfig( {
	server: {
		port: 5178,
		strictPort: true,
		// only bound to every interface when it is actually wanted
		host: lan ? true : 'localhost',
		https: https ? { key: https.key, cert: https.cert } : undefined,
	},
	// wasm_exec.js is Go's own runtime glue, loaded with a script tag at runtime
	// from public/ — it is not an ES module and must not be bundled.
	assetsInclude: [ '**/*.wasm' ],
	build: {
		rollupOptions: {
			input: {
				main: resolve( import.meta.dirname, 'index.html' ),
				play: resolve( import.meta.dirname, 'play.html' ),
				rules: resolve( import.meta.dirname, 'rules.html' ),
				board: resolve( import.meta.dirname, 'board.html' ),
				pieces: resolve( import.meta.dirname, 'pieces.html' ),
				compare: resolve( import.meta.dirname, 'compare.html' ),
			},
		},
	},
} );
