import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Five pages, so they all have to be named — a default build would only pick up
// index.html and quietly drop the playground, the pieces viewer and the
// comparison page.
export default defineConfig( {
	server: { port: 5178, strictPort: true },
	build: {
		rollupOptions: {
			input: {
				main: resolve( import.meta.dirname, 'index.html' ),
				play: resolve( import.meta.dirname, 'play.html' ),
				board: resolve( import.meta.dirname, 'board.html' ),
				pieces: resolve( import.meta.dirname, 'pieces.html' ),
				compare: resolve( import.meta.dirname, 'compare.html' ),
			},
		},
	},
} );
