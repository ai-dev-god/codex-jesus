import {
  RoomMembershipRole,
  RoomMembershipStatus,
  RoomStatus,
  type PrismaClient
} from '@prisma/client';

import { RoomsService } from '../modules/rooms/rooms.service';
import { HttpError } from '../modules/observability-ops/http-error';

jest.mock('../realtime/gateway', () => ({
  realtimeGateway: {
    emitLobbyEvent: jest.fn(),
    emitActivePlayEvent: jest.fn(),
    registerConnection: jest.fn(),
    handleReconnect: jest.fn()
  }
}));

const { realtimeGateway } = jest.requireMock('../realtime/gateway') as {
  realtimeGateway: {
    emitLobbyEvent: jest.Mock;
    emitActivePlayEvent: jest.Mock;
    registerConnection: jest.Mock;
    handleReconnect: jest.Mock;
  };
};

type MockDelegate = Record<string, jest.Mock>;

type MockPrisma = {
  room: MockDelegate;
  roomMembership: MockDelegate;
  $transaction: jest.Mock;
};

const createMockPrisma = (): MockPrisma => {
  const room: MockDelegate = {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn()
  };

  const roomMembership: MockDelegate = {
    create: jest.fn(),
    update: jest.fn(),
    findFirst: jest.fn()
  };

  const mock: MockPrisma = {
    room,
    roomMembership,
    $transaction: jest.fn()
  };

  mock.$transaction.mockImplementation(
    async (callback: (tx: { room: MockDelegate; roomMembership: MockDelegate }) => Promise<unknown>) =>
      callback({ room: mock.room, roomMembership: mock.roomMembership })
  );

  return mock;
};

const activeMember = {
  id: 'member-1',
  email: 'member@example.com',
  role: 'MEMBER',
  status: 'ACTIVE'
} as const;

describe('RoomsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates rooms with host membership and emits lobby event', async () => {
    const prisma = createMockPrisma();
    const now = new Date('2025-01-01T00:00:00Z');
    const service = new RoomsService(prisma as unknown as PrismaClient, {
      capacity: 8,
      codeFactory: () => 'ABCD12',
      now: () => now
    });

    prisma.room.create.mockResolvedValueOnce({
      id: 'room-123',
      name: 'Recovery Sprint',
      inviteCode: 'ABCD12',
      status: RoomStatus.LOBBY,
      capacity: 8,
      hostId: activeMember.id,
      createdAt: now,
      updatedAt: now,
      memberships: [
        {
          id: 'membership-1',
          role: RoomMembershipRole.HOST,
          status: RoomMembershipStatus.ACTIVE,
          joinedAt: now,
          userId: activeMember.id,
          user: {
            id: activeMember.id,
            email: activeMember.email,
            profile: {
              displayName: 'Alex'
            }
          }
        }
      ]
    });

    const result = await service.createRoom(activeMember, { name: 'Recovery Sprint' });

    expect(prisma.room.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Recovery Sprint',
          inviteCode: 'ABCD12',
          capacity: 8,
          hostId: activeMember.id
        })
      })
    );
    expect(result).toMatchObject({
      id: 'room-123',
      inviteCode: 'ABCD12',
      status: RoomStatus.LOBBY,
      capacity: 8,
      members: [
        expect.objectContaining({
          id: activeMember.id,
          role: RoomMembershipRole.HOST,
          status: RoomMembershipStatus.ACTIVE,
          displayName: 'Alex'
        })
      ],
      membership: expect.objectContaining({
        userId: activeMember.id,
        role: RoomMembershipRole.HOST,
        status: RoomMembershipStatus.ACTIVE
      })
    });
    expect(realtimeGateway.emitLobbyEvent).toHaveBeenCalledWith('room-123', {
      type: 'ROOM_UPDATED',
      payload: expect.objectContaining({
        id: 'room-123',
        members: expect.any(Array)
      })
    });
  });

  it('returns existing active membership when joining a room twice', async () => {
    const prisma = createMockPrisma();
    const now = new Date('2025-01-02T00:00:00Z');
    const service = new RoomsService(prisma as unknown as PrismaClient, {
      capacity: 8,
      codeFactory: () => 'XYZ987',
      now: () => now
    });

    prisma.room.findUnique.mockResolvedValueOnce({
      id: 'room-1',
      name: 'Sprint',
      inviteCode: 'XYZ987',
      status: RoomStatus.LOBBY,
      capacity: 8,
      hostId: 'host-1',
      createdAt: now,
      updatedAt: now,
      memberships: [
        {
          id: 'membership-1',
          userId: activeMember.id,
          role: RoomMembershipRole.PLAYER,
          status: RoomMembershipStatus.ACTIVE,
          joinedAt: now,
          user: {
            id: activeMember.id,
            email: activeMember.email,
            profile: {
              displayName: 'Alex'
            }
          }
        }
      ]
    });

    prisma.room.findUnique.mockResolvedValueOnce({
      id: 'room-1',
      name: 'Sprint',
      inviteCode: 'XYZ987',
      status: RoomStatus.LOBBY,
      capacity: 8,
      hostId: 'host-1',
      createdAt: now,
      updatedAt: now,
      memberships: [
        {
          id: 'membership-1',
          userId: activeMember.id,
          role: RoomMembershipRole.PLAYER,
          status: RoomMembershipStatus.ACTIVE,
          joinedAt: now,
          user: {
            id: activeMember.id,
            email: activeMember.email,
            profile: {
              displayName: 'Alex'
            }
          }
        }
      ]
    });

    const result = await service.joinRoomByCode(activeMember, 'xyz987');

    expect(prisma.roomMembership.create).not.toHaveBeenCalled();
    expect(prisma.roomMembership.update).not.toHaveBeenCalled();
    expect(result.membership).toMatchObject({
      userId: activeMember.id,
      role: RoomMembershipRole.PLAYER,
      status: RoomMembershipStatus.ACTIVE
    });
    expect(realtimeGateway.emitLobbyEvent).not.toHaveBeenCalled();
  });

  it('reactivates existing membership when previously left', async () => {
    const prisma = createMockPrisma();
    const now = new Date('2025-01-03T00:00:00Z');
    const service = new RoomsService(prisma as unknown as PrismaClient, {
      capacity: 4,
      now: () => now
    });

    prisma.room.findUnique.mockResolvedValueOnce({
      id: 'room-2',
      name: 'Recovery',
      inviteCode: 'ROOM42',
      status: RoomStatus.LOBBY,
      capacity: 4,
      hostId: 'host-2',
      createdAt: now,
      updatedAt: now,
      memberships: [
        {
          id: 'membership-legacy',
          userId: activeMember.id,
          role: RoomMembershipRole.PLAYER,
          status: RoomMembershipStatus.LEFT,
          joinedAt: new Date('2025-01-01T00:00:00Z'),
          user: {
            id: activeMember.id,
            email: activeMember.email,
            profile: {
              displayName: 'Alex'
            }
          }
        }
      ]
    });

    prisma.roomMembership.update.mockResolvedValueOnce({
      id: 'membership-legacy',
      userId: activeMember.id,
      role: RoomMembershipRole.PLAYER,
      status: RoomMembershipStatus.ACTIVE,
      joinedAt: now,
      user: {
        id: activeMember.id,
        email: activeMember.email,
        profile: {
          displayName: 'Alex'
        }
      }
    });

    prisma.room.findUnique.mockResolvedValueOnce({
      id: 'room-2',
      name: 'Recovery',
      inviteCode: 'ROOM42',
      status: RoomStatus.LOBBY,
      capacity: 4,
      hostId: 'host-2',
      createdAt: now,
      updatedAt: now,
      memberships: [
        {
          id: 'membership-legacy',
          userId: activeMember.id,
          role: RoomMembershipRole.PLAYER,
          status: RoomMembershipStatus.ACTIVE,
          joinedAt: now,
          user: {
            id: activeMember.id,
            email: activeMember.email,
            profile: {
              displayName: 'Alex'
            }
          }
        }
      ]
    });

    const result = await service.joinRoomByCode(activeMember, 'ROOM42');

    expect(prisma.roomMembership.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'membership-legacy' },
        data: expect.objectContaining({ status: RoomMembershipStatus.ACTIVE, joinedAt: now })
      })
    );
    expect(result.membership).toMatchObject({
      userId: activeMember.id,
      status: RoomMembershipStatus.ACTIVE
    });
    expect(realtimeGateway.emitLobbyEvent).toHaveBeenCalledWith('room-2', expect.any(Object));
  });

  it('prevents reactivating a membership when the room is already full', async () => {
    const prisma = createMockPrisma();
    const now = new Date('2025-01-04T00:00:00Z');
    const service = new RoomsService(prisma as unknown as PrismaClient, {
      capacity: 3,
      now: () => now
    });

    prisma.room.findUnique.mockResolvedValueOnce({
      id: 'room-full',
      name: 'Full Room',
      inviteCode: 'FULLON',
      status: RoomStatus.LOBBY,
      capacity: 3,
      hostId: 'host-1',
      createdAt: now,
      updatedAt: now,
      memberships: [
        {
          id: 'host-membership',
          userId: 'host-1',
          role: RoomMembershipRole.HOST,
          status: RoomMembershipStatus.ACTIVE,
          joinedAt: now,
          user: {
            id: 'host-1',
            email: 'host@example.com',
            profile: {
              displayName: 'Host'
            }
          }
        },
        {
          id: 'player-1-membership',
          userId: 'player-1',
          role: RoomMembershipRole.PLAYER,
          status: RoomMembershipStatus.ACTIVE,
          joinedAt: now,
          user: {
            id: 'player-1',
            email: 'player1@example.com',
            profile: {
              displayName: 'Player 1'
            }
          }
        },
        {
          id: 'player-2-membership',
          userId: 'player-2',
          role: RoomMembershipRole.PLAYER,
          status: RoomMembershipStatus.ACTIVE,
          joinedAt: now,
          user: {
            id: 'player-2',
            email: 'player2@example.com',
            profile: {
              displayName: 'Player 2'
            }
          }
        },
        {
          id: 'returning-membership',
          userId: activeMember.id,
          role: RoomMembershipRole.PLAYER,
          status: RoomMembershipStatus.LEFT,
          joinedAt: now,
          user: {
            id: activeMember.id,
            email: activeMember.email,
            profile: {
              displayName: 'Alex'
            }
          }
        }
      ]
    });

    await expect(service.joinRoomByCode(activeMember, 'fullon')).rejects.toMatchObject({
      status: 409,
      code: 'ROOM_FULL'
    });
    expect(prisma.roomMembership.update).not.toHaveBeenCalled();
    expect(prisma.roomMembership.create).not.toHaveBeenCalled();
    expect(realtimeGateway.emitLobbyEvent).not.toHaveBeenCalled();
  });

  it('creates new membership when capacity allows', async () => {
    const prisma = createMockPrisma();
    const now = new Date('2025-01-04T00:00:00Z');
    const service = new RoomsService(prisma as unknown as PrismaClient, {
      capacity: 4,
      now: () => now
    });

    prisma.room.findUnique.mockResolvedValueOnce({
      id: 'room-3',
      name: 'Recovery',
      inviteCode: 'JOINME',
      status: RoomStatus.LOBBY,
      capacity: 4,
      hostId: 'host-3',
      createdAt: now,
      updatedAt: now,
      memberships: [
        {
          id: 'host-membership',
          userId: 'host-3',
          role: RoomMembershipRole.HOST,
          status: RoomMembershipStatus.ACTIVE,
          joinedAt: now,
          user: {
            id: 'host-3',
            email: 'host@example.com',
            profile: {
              displayName: 'Host'
            }
          }
        }
      ]
    });

    prisma.roomMembership.create.mockResolvedValueOnce({
      id: 'membership-new',
      userId: activeMember.id,
      role: RoomMembershipRole.PLAYER,
      status: RoomMembershipStatus.ACTIVE,
      joinedAt: now,
      user: {
        id: activeMember.id,
        email: activeMember.email,
        profile: {
          displayName: 'Alex'
        }
      }
    });

    prisma.room.findUnique.mockResolvedValueOnce({
      id: 'room-3',
      name: 'Recovery',
      inviteCode: 'JOINME',
      status: RoomStatus.LOBBY,
      capacity: 4,
      hostId: 'host-3',
      createdAt: now,
      updatedAt: now,
      memberships: [
        {
          id: 'host-membership',
          userId: 'host-3',
          role: RoomMembershipRole.HOST,
          status: RoomMembershipStatus.ACTIVE,
          joinedAt: now,
          user: {
            id: 'host-3',
            email: 'host@example.com',
            profile: {
              displayName: 'Host'
            }
          }
        },
        {
          id: 'membership-new',
          userId: activeMember.id,
          role: RoomMembershipRole.PLAYER,
          status: RoomMembershipStatus.ACTIVE,
          joinedAt: now,
          user: {
            id: activeMember.id,
            email: activeMember.email,
            profile: {
              displayName: 'Alex'
            }
          }
        }
      ]
    });

    const result = await service.joinRoomByCode(activeMember, 'joinme');

    expect(prisma.roomMembership.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          roomId: 'room-3',
          userId: activeMember.id,
          role: RoomMembershipRole.PLAYER
        })
      })
    );
    expect(result.members).toHaveLength(2);
    expect(realtimeGateway.emitLobbyEvent).toHaveBeenCalledWith('room-3', expect.any(Object));
  });

  it('throws when invite code is invalid', async () => {
    const prisma = createMockPrisma();
    const service = new RoomsService(prisma as unknown as PrismaClient);

    prisma.room.findUnique.mockResolvedValueOnce(null);

    await expect(service.joinRoomByCode(activeMember, 'invalid')).rejects.toBeInstanceOf(HttpError);

    await expect(service.joinRoomByCode(activeMember, 'invalid')).rejects.toMatchObject({
      status: 404,
      code: 'INVALID_CODE'
    });
  });

  it('prevents joining when capacity is reached', async () => {
    const prisma = createMockPrisma();
    const service = new RoomsService(prisma as unknown as PrismaClient, { capacity: 2 });
    const now = new Date('2025-01-05T00:00:00Z');

    prisma.room.findUnique.mockResolvedValueOnce({
      id: 'room-4',
      name: 'Recovery',
      inviteCode: 'FULLY',
      status: RoomStatus.LOBBY,
      capacity: 2,
      hostId: 'host-4',
      createdAt: now,
      updatedAt: now,
      memberships: [
        {
          id: 'member-1',
          userId: 'host-4',
          role: RoomMembershipRole.HOST,
          status: RoomMembershipStatus.ACTIVE,
          joinedAt: now,
          user: {
            id: 'host-4',
            email: 'host@example.com',
            profile: {
              displayName: 'Host'
            }
          }
        },
        {
          id: 'member-2',
          userId: 'player-2',
          role: RoomMembershipRole.PLAYER,
          status: RoomMembershipStatus.ACTIVE,
          joinedAt: now,
          user: {
            id: 'player-2',
            email: 'player@example.com',
            profile: {
              displayName: 'Player 2'
            }
          }
        }
      ]
    });

    await expect(service.joinRoomByCode(activeMember, 'FULLY')).rejects.toMatchObject({
      status: 409,
      code: 'ROOM_FULL'
    });
  });

  it('fetches a room by identifier and maps membership context', async () => {
    const prisma = createMockPrisma();
    const service = new RoomsService(prisma as unknown as PrismaClient, { capacity: 6 });
    const now = new Date('2025-01-06T00:00:00Z');

    prisma.room.findUnique.mockResolvedValueOnce({
      id: 'room-lookup',
      name: 'Lookup',
      inviteCode: 'LOOKUP',
      status: RoomStatus.LOBBY,
      capacity: 6,
      hostId: 'host-lookup',
      createdAt: now,
      updatedAt: now,
      memberships: [
        {
          id: 'host-membership',
          userId: 'host-lookup',
          role: RoomMembershipRole.HOST,
          status: RoomMembershipStatus.ACTIVE,
          joinedAt: now,
          user: {
            id: 'host-lookup',
            email: 'host@example.com',
            profile: {
              displayName: 'Host'
            }
          }
        },
        {
          id: 'viewer-membership',
          userId: activeMember.id,
          role: RoomMembershipRole.PLAYER,
          status: RoomMembershipStatus.ACTIVE,
          joinedAt: now,
          user: {
            id: activeMember.id,
            email: activeMember.email,
            profile: {
              displayName: 'Alex'
            }
          }
        }
      ]
    });

    const result = await service.getRoom(activeMember, 'room-lookup');

    expect(prisma.room.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'room-lookup' }
      })
    );
    expect(result.membership).toMatchObject({
      userId: activeMember.id,
      role: RoomMembershipRole.PLAYER,
      status: RoomMembershipStatus.ACTIVE
    });
  });

  it('throws 404 when room cannot be found by id', async () => {
    const prisma = createMockPrisma();
    const service = new RoomsService(prisma as unknown as PrismaClient);

    prisma.room.findUnique.mockResolvedValueOnce(null);

    await expect(service.getRoom(activeMember, 'missing-room')).rejects.toMatchObject({
      status: 404,
      code: 'ROOM_NOT_FOUND'
    });
  });
});
