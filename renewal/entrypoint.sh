#!/bin/sh
set -eu

packetver="${PACKETVER:-20211103}"
renewal="${RENEWAL:-true}"

case "$packetver" in
	20141022)
		renewal=false
		;;
	20211103)
		renewal=true
		;;
esac

packet_keys=false
if [ "$renewal" = "false" ]; then
	packet_keys=true
fi

client_profile=renewal
if [ "$renewal" = "false" ]; then
	client_profile=pre-renewal
fi

printf '%s\n' \
	'window.ROConfigLocal = {' \
	"  packetver: $packetver," \
	"  renewal: $renewal," \
	"  packetKeys: $packet_keys," \
	"  loadLua: true," \
	"  enableAchievements: true," \
	"  enableBank: true," \
	"  remoteClient: '/client/$client_profile/'," \
	"  type: 'INLINE'," \
	"  skipIntro: true," \
	'  servers: [{' \
	"    display: '$([ "$renewal" = "true" ] && printf '%s' Renewal || printf '%s' Pre-Renewal)'," \
	"    packetver: $packetver," \
	"    renewal: $renewal," \
	"    packetKeys: $packet_keys," \
	"    address: 'serve'," \
	"    port: 6900," \
	"    version: 55," \
	"    langtype: 1," \
	"    socketProxy: 'ws://127.0.0.1:5999'," \
	"    forceUseAddress: true" \
	'  }]' \
	'};' | tee /app/Config.local.js /app/dist/Web/Config.local.js >/dev/null

exec "$@"
