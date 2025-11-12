import { RealtimeGateway } from '../realtime/gateway';

describe('RealtimeGateway', () => {
  it('broadcasts lobby events to active connections', () => {
    const gateway = new RealtimeGateway();
    const handler = jest.fn();

    const unsubscribe = gateway.registerConnection('room-1', 'user-1', handler);

    gateway.emitLobbyEvent('room-1', { type: 'READY_TOGGLED', payload: { ready: true } });

    expect(handler).toHaveBeenCalledWith({
      channel: 'lobby',
      type: 'READY_TOGGLED',
      payload: { ready: true }
    });

    unsubscribe();

    gateway.emitLobbyEvent('room-1', { type: 'READY_TOGGLED', payload: { ready: false } });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('replays last known state upon reconnect', () => {
    const gateway = new RealtimeGateway();
    const handler = jest.fn();

    gateway.emitLobbyEvent('room-2', { type: 'READY_TOGGLED', payload: { ready: true } });
    gateway.emitActivePlayEvent('room-2', { type: 'MOVE_BROADCAST', payload: { move: 'jump' } });

    gateway.handleReconnect('room-2', 'user-42', handler);

    expect(handler).toHaveBeenCalledWith({
      channel: 'system',
      type: 'RESYNC',
      payload: {
        lobby: {
          channel: 'lobby',
          type: 'READY_TOGGLED',
          payload: { ready: true }
        },
        activePlay: {
          channel: 'active',
          type: 'MOVE_BROADCAST',
          payload: { move: 'jump' }
        }
      }
    });
  });
});
