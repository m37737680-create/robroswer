#!/bin/sh
set -eu

# ============================================================
# Configurazione
# ============================================================

packetver="${PACKETVER:-20211103}"
game_host="${GAME_HOST:-127.0.0.1}"
client_public_host="${CLIENT_PUBLIC_HOST:-$game_host}"
WSPROXY_PORT="${WSPROXY_PORT:-5999}"
WEB_PORT="${WEB_PORT:-8080}"
LOGIN_PORT="${LOGIN_PORT:-6900}"
LANGTYPE="${LANGTYPE:-1}"
CLIENT_VERSION="${CLIENT_VERSION:-55}"
WORLD_MAP_EPISODE="${WORLD_MAP_EPISODE:-12}"
CLIENT_GRF_LIST="${CLIENT_GRF_LIST:-DATA.INI}"
USE_ADMIN_SPRITE="${USE_ADMIN_SPRITE:-false}"

# CLIENT_PUBLIC_HOST può essere un IP/hostname oppure un URL completo.
# Il WebSocket usa sempre GAME_HOST, che resta l'indirizzo interno configurato.
client_public_scheme="ws"
case "$client_public_host" in
    https://*) client_public_scheme="wss"; client_public_host="${client_public_host#https://}" ;;
    http://*) client_public_host="${client_public_host#http://}" ;;
    ws://*) client_public_host="${client_public_host#ws://}" ;;
    wss://*) client_public_scheme="wss"; client_public_host="${client_public_host#wss://}" ;;
esac
client_public_host="${client_public_host%%/*}"

# ============================================================
# Determina Renewal / Pre-Renewal dal PacketVer
# ============================================================

if [ "$packetver" -ge 20181121 ] 2>/dev/null; then
    renewal=true
else
    renewal=false
fi


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

# ============================================================
# Nome server
# ============================================================

if [ "$renewal" = "true" ]; then
    server_display="Renewal"
    load_lua=true
else
    server_display="Pre-Renewal"
    load_lua=false
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
echo "GAME_HOST        : $game_host"
echo "CLIENT_PUBLIC_HOST: $client_public_host"
echo "LOGIN_PORT       : $LOGIN_PORT"
echo "WSPROXY_PORT     : $WSPROXY_PORT"
echo "WEB_PORT         : $WEB_PORT"
echo "LANGTYPE         : $LANGTYPE"
echo "CLIENT_VERSION   : $CLIENT_VERSION"
echo "WORLD_MAP_EPISODE: $WORLD_MAP_EPISODE"
echo "CLIENT_GRF_LIST  : $CLIENT_GRF_LIST"
echo "SERVER_DISPLAY   : $server_display"
echo "=============================================="


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

  remoteClient: (window.location.pathname.indexOf('/renewal/') === 0 ? '/renewal/client/' : '/client/'),

  // Keep profile-wide values for modules that read them before server selection.
  packetver: $packetver,
  renewal: $renewal,
  packetKeys: $packet_keys,
  loadLua: $load_lua,
  useAdminSprite: $USE_ADMIN_SPRITE,

  servers: [
    {
      display: '$server_display',
      desc: 'Ragnarok Server',

      address: '$client_public_host',
      port: $LOGIN_PORT,

      version: $CLIENT_VERSION,
      langtype: $LANGTYPE,

      packetver: $packetver,
      renewal: $renewal,

      worldMapSettings: {
        episode: $WORLD_MAP_EPISODE
      },

      packetKeys: $packet_keys,

      socketProxy: '$client_public_scheme://$game_host:$WSPROXY_PORT',

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

  grfList: '$CLIENT_GRF_LIST',
  hashFiles: [],

  onReady: null,

  plugins: {},

  registrationweb: '',

  saveFiles: true,

  ThirdPersonCamera: false,

  transitionDuration: 500
};
EOF
}


echo "Generating Config.js..."
generate_base_config | tee \
    /app/Config.js \
    /app/dist/Web/Config.js \
    >/dev/null
echo "Config.js generated."


# ============================================================
# Avvio
# ============================================================

echo "=============================================="
echo " Configuration completed."
echo " Starting application..."
echo "=============================================="

exec "$@"
