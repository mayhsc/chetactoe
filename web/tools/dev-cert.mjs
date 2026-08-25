// Makes the certificate the dev server needs to be reachable over HTTPS.
//
//   node tools/dev-cert.mjs          # create or refresh .certs/
//   node tools/dev-cert.mjs --trust  # and add it to the login keychain (asks for your password)
//
// Why this exists at all: **WebGPU is only handed to a secure context.** `https://`
// counts and `http://localhost` gets a special exemption, but `http://192.168.1.x`
// does not — so the moment you open the dev server by its LAN address, which is the
// only way to see it on a phone, `navigator.gpu` is undefined and the board refuses
// to draw on a browser that supports it perfectly well.
//
// The usual workaround is chrome://flags → "Insecure origins treated as secure".
// Don't. It comes undone, for three reasons that all look like "it turned itself
// off again": Chrome drops flags once they pass their expiry milestone, resetting or
// syncing a profile clears them, and — most often — the flag names one exact origin,
// so the next time your router hands out a different address the entry no longer
// matches anything.
//
// A certificate has none of those failure modes. It covers this machine's `.local`
// name, which does not change when the DHCP lease does, so the URL you bookmark
// keeps working.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname( dirname( fileURLToPath( import.meta.url ) ) );
const dir = join( root, '.certs' );
const keyPath = join( dir, 'key.pem' );
const certPath = join( dir, 'cert.pem' );
const stampPath = join( dir, 'hosts.json' );

/** localhost, this machine's Bonjour name, and every IPv4 address it currently has. */
export function hosts() {

	const names = [ 'localhost' ];

	try {

		const local = execFileSync( 'scutil', [ '--get', 'LocalHostName' ] ).toString().trim();
		if ( local ) names.push( `${local}.local` );

	} catch { /* not macOS, or no Bonjour name — the IPs below still work */ }

	const ips = [ '127.0.0.1' ];

	for ( const addresses of Object.values( networkInterfaces() ) ) {

		for ( const address of addresses ?? [] ) {

			if ( address.family === 'IPv4' && ! address.internal ) ips.push( address.address );

		}

	}

	return { names, ips };

}

function make( { names, ips } ) {

	mkdirSync( dir, { recursive: true } );

	const san = [ ...names.map( ( n ) => `DNS:${n}` ), ...ips.map( ( i ) => `IP:${i}` ) ].join( ',' );

	execFileSync( 'openssl', [
		'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
		'-keyout', keyPath, '-out', certPath,
		'-days', '825', // the longest Safari and Chrome will accept
		'-subj', '/CN=Chetactoe dev server',
		'-addext', `subjectAltName=${san}`,
		'-addext', 'basicConstraints=critical,CA:true',
	], { stdio: 'ignore' } );

	writeFileSync( stampPath, JSON.stringify( { names, ips }, null, '\t' ) );

	return san;
}

/**
 * Returns the cert, making it first if it is missing or no longer covers the
 * addresses this machine has now — which is what makes a new DHCP lease a
 * non-event rather than an afternoon.
 */
export function ensureCert() {

	const want = hosts();
	const have = existsSync( stampPath ) ? JSON.parse( readFileSync( stampPath, 'utf8' ) ) : null;

	const stale = ! existsSync( keyPath ) || ! existsSync( certPath ) || ! have ||
		JSON.stringify( have ) !== JSON.stringify( want );

	if ( stale ) make( want );

	return { key: readFileSync( keyPath ), cert: readFileSync( certPath ), hosts: want, made: stale };

}

// ------------------------------------------------------------------- as a script

if ( process.argv[ 1 ] === fileURLToPath( import.meta.url ) ) {

	const { hosts: covered, made } = ensureCert();

	console.log( `\n${made ? 'made' : 'reusing'} .certs/cert.pem` );
	console.log( `  names  ${covered.names.join( ', ' )}` );
	console.log( `  ips    ${covered.ips.join( ', ' )}` );

	if ( process.argv.includes( '--trust' ) ) {

		// Without this the browser shows an interstitial once per session and you
		// click through; with it, nothing complains at all. It only affects this Mac.
		console.log( '\nadding to the login keychain — macOS will ask for your password' );

		execFileSync( 'security', [
			'add-trusted-cert', '-d', '-r', 'trustRoot',
			'-k', `${process.env.HOME}/Library/Keychains/login.keychain-db`,
			certPath,
		], { stdio: 'inherit' } );

		console.log( 'trusted. Restart the browser to pick it up.' );

	} else {

		console.log( '\nThe browser will warn once and let you continue — that is enough for WebGPU.' );
		console.log( 'To silence the warning on this Mac:  node tools/dev-cert.mjs --trust' );

	}

	console.log( `\n  npm run dev:lan   ->  https://${covered.names.at( - 1 )}:5178\n` );

}
