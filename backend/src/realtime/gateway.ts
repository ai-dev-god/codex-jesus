type RoomEventHandler = (event: RoomRealtimeEvent) => void;

export type LobbyEvent = {
  channel: 'lobby';
  type: string;
  payload: unknown;
};

export type ActivePlayEvent = {
  channel: 'active';
  type: string;
  payload: unknown;
};

export type SystemEvent = {
  channel: 'system';
  type: 'RESYNC';
  payload: {
    lobby: LobbyEvent | null;
    activePlay: ActivePlayEvent | null;
  };
};

export type RoomRealtimeEvent = LobbyEvent | ActivePlayEvent | SystemEvent;

export class RealtimeGateway {
  private readonly lobbySnapshots = new Map<string, LobbyEvent>();
  private readonly activeSnapshots = new Map<string, ActivePlayEvent>();
  private readonly connections = new Map<string, Map<string, Set<RoomEventHandler>>>();

  registerConnection(roomId: string, userId: string, handler: RoomEventHandler): () => void {
    const roomConnections = this.connections.get(roomId) ?? new Map<string, Set<RoomEventHandler>>();
    const userHandlers = roomConnections.get(userId) ?? new Set<RoomEventHandler>();

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

  emitLobbyEvent(roomId: string, event: { type: string; payload: unknown }): void {
    const payload: LobbyEvent = {
      channel: 'lobby',
      type: event.type,
      payload: event.payload
    };

    this.lobbySnapshots.set(roomId, payload);
    this.broadcast(roomId, payload);
  }

  emitActivePlayEvent(roomId: string, event: { type: string; payload: unknown }): void {
    const payload: ActivePlayEvent = {
      channel: 'active',
      type: event.type,
      payload: event.payload
    };

    this.activeSnapshots.set(roomId, payload);
    this.broadcast(roomId, payload);
  }

  handleReconnect(roomId: string, userId: string, handler: RoomEventHandler): () => void {
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

  private broadcast(roomId: string, event: RoomRealtimeEvent): void {
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

export const realtimeGateway = new RealtimeGateway();
