# Renewal client

This directory contains the active ES module client and the Remote Client
backend used by the Compose project.

## Starting the client

The active frontend is the renewal client at `http://localhost:8080/renewal/`.
The packet mode is selected automatically from `PACKETVER`:

- versions before `20181121` use pre-renewal packet keys;
- versions from `20181121` onward use renewal packets.

The emulator and WebSocket proxy use `GAME_HOST`. The browser-facing game
address uses `CLIENT_PUBLIC_HOST`, which may be an IP, hostname, or full URL
(for example `192.168.1.20` or `https://game.example.com`). If omitted, it
falls back to `GAME_HOST`. The public client configuration is generated from `.env.renewal` (or
`.env.pre-renewal`) by `entrypoint.sh`; `LANGTYPE`, `CLIENT_VERSION`,
`WORLD_MAP_EPISODE` and `CLIENT_GRF_LIST` are also read from that environment.

When using `vite preview` directly, export the same value before starting Vite:

```powershell
$env:CLIENT_PUBLIC_HOST = "https://roita.servegame.com"
npm run preview -- --host 0.0.0.0
```

Vite extracts the hostname and adds it to `preview.allowedHosts`; do not use
`allowedHosts: true`, because that would accept arbitrary Host headers.

The remote client has one shared `resources` directory containing `DATA.INI`
and all GRF files. It is served at `/client/`; resources are not split into
renewal and pre-renewal folders.
