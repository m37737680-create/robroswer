/**
 * ROBrowser Configuration - Default Settings
 *
 * This file contains default configuration values.
 * To override settings without modifying this file, create Config.local.js
 * with your custom values in window.ROConfigLocal.
 *
 * Example Config.local.js:
 *   window.ROConfigLocal = {
 *       servers: [{ display: 'My Server', address: '192.168.1.1', ... }],
 *       skipIntro: true
 *   };
 */
window.ROConfigBase = {
	type: 'INLINE',
	application: 'ONLINE',
	development: true,
	// Relative local endpoint served by nginx from app/roBrowser/client.
	remoteClient: '/client/renewal/',
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
	grfList: null,
	hashFiles: [],
	loadLua: true,
	onReady: null,
	plugins: {},
	registrationweb: '',
	saveFiles: true,
	ThirdPersonCamera: false,
	transitionDuration: 500
};
