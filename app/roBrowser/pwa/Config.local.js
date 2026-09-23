/**
 * ROBrowser Local Configuration Overrides
 *
 * Copy this file to Config.local.js and customize as needed.
 * Values here will override those in Config.js.
 * Config.local.js is optional and will be silently ignored if not present.
 *
 * Docker / containerised deployments: mount this file at runtime:
 *   docker run -v /path/to/Config.local.js:/robrowser/Config.local.js:ro ...
 * See DOCKER.md for a complete deployment guide.
 */
window.ROConfigLocal = {
	type: 'INLINE',

	// Example: Override server settings
	servers: [
		{
			display: 'My Private Server',
			desc: 'custom server',
			address: window.location.hostname || 'localhost',
			port: 6900,
			version: 55,
			langtype: 1,
			packetver: 20211103,
			renewal: true,
			worldMapSettings: { episode: 12 },
			packetKeys: false,
			socketProxy: (window.location.protocol === 'https:' ? 'wss://' : 'ws://') +
				(window.location.hostname || 'localhost') + ':5999',
			adminList: [2000000],

			forceUseAddress: true,  // Uncomment for any containerised or NAT deployment.
			//                         // Prevents the client from using internal IPs returned
			//                         // by char/map server packets, which are unreachable
			//                         // outside the server's local network.
		}
	],

	// Example: Skip intro screen
	skipIntro: true,

	remoteClient: window.location.origin +
		(window.location.pathname.indexOf('/renewal/') === 0 ? '/renewal/client/' : '/client/'),
};
