// Fallback static config when PHP is not available
if (typeof window.RO_ENV === "undefined") {
	window.RO_ENV = {
		RATHENA_HOST: "",
		WEB_PORT: "8080",
		WSPROXY_PORT: "5999",
		LOGIN_PORT: 6900,
		PACKETVER: 20141022
	};
}
