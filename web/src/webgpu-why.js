/**
 * Why WebGPU is missing — which is not always "your browser is too old".
 *
 * `navigator.gpu` is only exposed in a **secure context**. https:// and
 * http://localhost qualify; http:// on a LAN address does not. So opening the
 * dev server by IP — http://192.168.1.20:5178, the URL you need to reach it from
 * a phone — silently removes WebGPU on a browser that supports it perfectly, and
 * a message blaming the browser sends you off to reinstall Chrome for an hour.
 *
 * Ask me how I know.
 */
export function whyNoWebGPU() {

	if ( ! window.isSecureContext ) {

		return `This page came from ${location.origin}, which browsers do not treat as a ` +
			'secure context — and WebGPU is only offered to those. Open it on localhost or ' +
			'over https and it will work; the browser is not the problem.';

	}

	if ( ! navigator.gpu ) {

		return 'This browser has no WebGPU at all. Try Chrome / Edge 113+ or Safari 26+.';

	}

	return 'This browser has WebGPU but could not give us a graphics adapter. Check that ' +
		'hardware acceleration is on — chrome://settings/system — and see chrome://gpu.';

}
