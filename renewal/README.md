# Renewal client

This directory contains the ES module client copied from `roBrowserLegacy` and
integrated into the Compose project.

## Starting the clients

- Pre-Renewal: `http://localhost:8080/`
- Renewal frontend: `http://localhost:8080/renewal/`

Both clients use the same nginx, Remote Client and WebSocket proxy services.
The Pre-Renewal client remains configured for packet version `20141022` with
packet keys enabled. The Renewal frontend is configured for packet version
`20211103` with packet keys disabled.

The current Compose file still contains the original rAthena service compiled
for `20141022`. A Renewal rAthena service must be configured separately with a
compatible packet version before the Renewal client can log in successfully;
the two frontends are intentionally isolated so changing one does not break
the stable Pre-Renewal client.
