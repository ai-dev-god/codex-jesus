# Rooms Module

## Endpoints
- `POST /rooms` — create a room, returning invite code and membership context for the host.
- `POST /rooms/join` — join a room via invite code; returns 404 `INVALID_CODE` or 409 `ROOM_FULL` for invalid/full rooms.
- `GET /rooms/:roomId` — fetch room state with member roster and the caller's membership details.

## Capacity & Limits
- Rooms are capped at **8 active participants** per the current product decision; hosts count towards the limit.
- Invite codes accept 4–12 alphanumeric characters and are normalised to uppercase before lookups.
- Duplicate join attempts reuse the existing membership record instead of creating duplicates.

## Realtime & Fallback
- Membership mutations fan out through the in-memory realtime gateway (`realtime/gateway.ts`) with `ROOM_UPDATED` lobby events.
- Environments without WebSocket support should poll `GET /rooms/:roomId` on a short interval; clients must handle `ROOM_FULL` errors by surfacing the UX banner documented in `ARTIFACTS/ux_flows.md`.
