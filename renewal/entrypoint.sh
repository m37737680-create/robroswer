#!/bin/sh
set -eu

# ============================================================
# Configurazione
# ============================================================

packetver="${PACKETVER:-20211103}"
renewal="${RENEWAL:-true}"

RATHENA_HOST="${RATHENA_HOST:-127.0.0.1}"
WSPROXY_PORT="${WSPROXY_PORT:-5999}"
WEB_PORT="${WEB_PORT:-8080}"
LOGIN_PORT="${LOGIN_PORT:-6900}"

USE_LOCAL_CONFIG="${USE_LOCAL_CONFIG:-true}"


# ============================================================
# Determina Renewal / Pre-Renewal dal PacketVer
# ============================================================

case "$packetver" in
    20141022)
        renewal=false
        ;;
    20211103)
        renewal=true
        ;;
esac


# ============================================================
# Packet Keys
# ============================================================

packet_keys=false

if [ "$renewal" = "false" ]; then
    packet_keys=true
fi


# ============================================================
# Client profile
# ============================================================

client_profile="renewal"

if [ "$renewal" = "false" ]; then
    client_profile="pre-renewal"
fi


# ============================================================
# Nome server
# ============================================================

if [ "$renewal" = "true" ]; then
    server_display="Renewal"
else
    server_display="Pre-Renewal"
fi


# ============================================================
# Informazioni
# ============================================================

echo "=============================================="
echo " roBrowser configuration"
echo "=============================================="
echo "PACKETVER        : $packetver"
echo "RENEWAL          : $renewal"
echo "PACKET_KEYS      : $packet_keys"
echo "CLIENT_PROFILE   : $client_profile"
echo "RATHENA_HOST     : $RATHENA_HOST"
echo "LOGIN_PORT       : $LOGIN_PORT"
echo "WSPROXY_PORT     : $WSPROXY_PORT"
echo "WEB_PORT         : $WEB_PORT"
echo "SERVER_DISPLAY   : $server_display"
echo "USE_LOCAL_CONFIG : $USE_LOCAL_CONFIG"
echo "=============================================="


# ============================================================
# Config.local.js
# ============================================================

generate_local_config()
{
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
        "    display: '$server_display'," \
        "    packetver: $packetver," \
        "    renewal: $renewal," \
        "    packetKeys: $packet_keys," \
        "    address: '$RATHENA_HOST'," \
        "    port: $LOGIN_PORT," \
        "    version: 55," \
        "    langtype: 1," \
        "    socketProxy: 'ws://$RATHENA_HOST:$WSPROXY_PORT'," \
        "    forceUseAddress: true" \
        '  }]' \
        '};'
}


# ============================================================
# Config.js
# ============================================================

generate_base_config()
{
    cat <<EOF
window.ROConfigBase = {
  type: 'INLINE',
  application: 'ONLINE',
  development: true,

  remoteClient: '/client/$client_profile/',

  servers: [
    {
      display: '$server_display',
      desc: 'Ragnarok Server',

      address: '$RATHENA_HOST',
      port: $LOGIN_PORT,

      version: 55,
      langtype: 1,

      packetver: $packetver,
      renewal: $renewal,

      worldMapSettings: {
        episode: 12
      },

      packetKeys: $packet_keys,

      socketProxy: 'ws://$RATHENA_HOST:$WSPROXY_PORT',

      forceUseAddress: true,

      adminList: [2000000]
    }
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
EOF
}


# ============================================================
# USE_LOCAL_CONFIG
# ============================================================

if [ "$USE_LOCAL_CONFIG" = "true" ]; then

    echo "USE_LOCAL_CONFIG=true"
    echo "Generating Config.local.js..."

    # Elimina Config.js base
    rm -f /app/Config.js
    rm -f /app/dist/Web/Config.js

    # Genera Config.local.js
    generate_local_config | tee \
        /app/Config.local.js \
        /app/dist/Web/Config.local.js \
        >/dev/null

    echo "Config.local.js generated."

else

    echo "USE_LOCAL_CONFIG=false"
    echo "Generating Config.js..."

    # Elimina Config.local.js
    rm -f /app/Config.local.js
    rm -f /app/dist/Web/Config.local.js

    # Genera Config.js
    generate_base_config | tee \
        /app/Config.js \
        /app/dist/Web/Config.js \
        >/dev/null

    echo "Config.js generated."

fi


# ============================================================
# Avvio
# ============================================================

echo "=============================================="
echo " Configuration completed."
echo " Starting application..."
echo "=============================================="

exec "$@"
