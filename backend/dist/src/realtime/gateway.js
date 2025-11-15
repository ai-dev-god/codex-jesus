"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.realtimeGateway = exports.RealtimeGateway = void 0;
class RealtimeGateway {
    constructor() {
        this.lobbySnapshots = new Map();
        this.activeSnapshots = new Map();
        this.connections = new Map();
    }
    registerConnection(roomId, userId, handler) {
        const roomConnections = this.connections.get(roomId) ?? new Map();
        const userHandlers = roomConnections.get(userId) ?? new Set();
        userHandlers.add(handler);
        roomConnections.set(userId, userHandlers);
        this.connections.set(roomId, roomConnections);
        return () => {
            const roomSet = this.connections.get(roomId);
            if (!roomSet) {
                return;
            }
            const handlers = roomSet.get(userId);
            if (!handlers) {
                return;
            }
            handlers.delete(handler);
            if (handlers.size === 0) {
                roomSet.delete(userId);
            }
            if (roomSet.size === 0) {
                this.connections.delete(roomId);
            }
        };
    }
    emitLobbyEvent(roomId, event) {
        const payload = {
            channel: 'lobby',
            type: event.type,
            payload: event.payload
        };
        this.lobbySnapshots.set(roomId, payload);
        this.broadcast(roomId, payload);
    }
    emitActivePlayEvent(roomId, event) {
        const payload = {
            channel: 'active',
            type: event.type,
            payload: event.payload
        };
        this.activeSnapshots.set(roomId, payload);
        this.broadcast(roomId, payload);
    }
    handleReconnect(roomId, userId, handler) {
        const unsubscribe = this.registerConnection(roomId, userId, handler);
        handler({
            channel: 'system',
            type: 'RESYNC',
            payload: {
                lobby: this.lobbySnapshots.get(roomId) ?? null,
                activePlay: this.activeSnapshots.get(roomId) ?? null
            }
        });
        return unsubscribe;
    }
    broadcast(roomId, event) {
        const roomConnections = this.connections.get(roomId);
        if (!roomConnections) {
            return;
        }
        for (const handlers of roomConnections.values()) {
            for (const handler of handlers) {
                handler(event);
            }
        }
    }
}
exports.RealtimeGateway = RealtimeGateway;
exports.realtimeGateway = new RealtimeGateway();
