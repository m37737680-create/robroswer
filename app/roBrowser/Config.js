/**
 * ROBrowser Configuration - Default Settings
 *
 * This file contains the complete runtime configuration.
 * The container entrypoint writes the deployment values here from the
 * selected environment file before starting the web server.
 */
window.ROConfigBase = {
	type: 'INLINE',
	application: 'ONLINE',
	development: true,
	// Shared remote client served by nginx.
	remoteClient: '/client/',
	packetver: 20211103,
	renewal: true,
	packetKeys: false,
	loadLua: true,
	useAdminSprite: false,
	servers: [
		{
			display: 'Renewal',
			desc: 'Renewal server',
			address: '127.0.0.1',
			port: 6900,
			version: 55,
			langtype: 1,
			packetver: 20211103,
			renewal: true,
			worldMapSettings: { episode: 12 },
			packetKeys: false,
			socketProxy: 'ws://127.0.0.1:5999',
			forceUseAddress: true,
			adminList: [2000000]
		}
		// ADD PUBLIC TEST SERVERS HERE WITH _M _F REGISTRATION
	],
	packetDump: false,
	skipServerList: true,
	skipIntro: false,
	aura: {},
	autoLogin: [],
	BGMFileExtension: ['mp3'],
	calculateHash: false,
	CameraMaxZoomOut: 5,
	charBlockSize: 0,
	clientHash: null,
	clientVersionMode: 'PacketVer',
	disableConsole: false,
	enableServerHotkeys: false,
	enableAchievements: true,
	enableBank: true,
	enableCashShop: false,
	enableCheckAttendance: false,
	enableDmgSuffix: false,
	enableHomunAutoFeed: false,
	enableMapName: false,
	FirstPersonCamera: false,
	grfList: 'DATA.INI',
	hashFiles: [],
	onReady: null,
	plugins: {},
	registrationweb: '',
	saveFiles: true,
	ThirdPersonCamera: false,
	transitionDuration: 500
};
