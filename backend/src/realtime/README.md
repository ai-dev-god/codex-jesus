# Realtime Gateway Stub

- `RealtimeGateway` stores the latest lobby (`ROOM_UPDATED`) and active play events per room and replays them when clients reconnect.
- `registerConnection(roomId, userId, handler)` attaches handlers that receive `lobby`, `active`, or `system` (`RESYNC`) events and returns an unsubscribe callback.
- `emitLobbyEvent` / `emitActivePlayEvent` broadcast to all registered handlers while snapshotting the payload for reconnect flows.
- Clients without WebSocket/WebRTC support can call `handleReconnect` with an in-memory handler to reuse the same interface while falling back to polling.
