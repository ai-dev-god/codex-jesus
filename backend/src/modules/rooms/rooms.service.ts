import { randomBytes } from 'crypto';
import {
  PrismaClient,
  RoomMembershipRole,
  RoomMembershipStatus,
  RoomStatus,
  type Prisma
} from '@prisma/client';

import prismaClient from '../../lib/prisma';
import { HttpError } from '../observability-ops/http-error';
import { realtimeGateway } from '../../realtime/gateway';

type AuthenticatedUser = Express.AuthenticatedUser;

type RoomWithMemberships = Prisma.RoomGetPayload<{
  include: {
    memberships: {
      include: {
        user: {
          include: {
            profile: true;
          };
        };
      };
      orderBy: {
        joinedAt: 'asc';
      };
    };
  };
}>;

export type CreateRoomInput = {
  name?: string | null;
};

export type RoomMemberDto = {
  id: string;
  displayName: string;
  role: RoomMembershipRole;
  status: RoomMembershipStatus;
  joinedAt: string;
};

export type RoomMembershipContext = {
  id: string;
  userId: string;
  role: RoomMembershipRole;
  status: RoomMembershipStatus;
  joinedAt: string;
};

export type RoomDto = {
  id: string;
  name: string | null;
  inviteCode: string;
  status: RoomStatus;
  capacity: number;
  hostId: string;
  createdAt: string;
  updatedAt: string;
  members: RoomMemberDto[];
  membership: RoomMembershipContext | null;
};

export type RoomsServiceOptions = {
  capacity?: number;
  codeFactory?: () => string;
  now?: () => Date;
};

const DEFAULT_CAPACITY = 8;

const ROOM_INCLUDE = {
  memberships: {
    include: {
      user: {
        include: {
          profile: true
        }
      }
    },
    orderBy: {
      joinedAt: 'asc'
    }
  }
} satisfies Prisma.RoomInclude;

const defaultCodeFactory = (): string => {
  const raw = randomBytes(4).toString('base64').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return raw.slice(0, 8);
};

const normaliseInviteCode = (code: string): string => code.trim().toUpperCase();

const displayNameFor = (
  user: Prisma.UserGetPayload<{ include: { profile: true } }>
): string => user.profile?.displayName ?? user.email;

export class RoomsService {
  private readonly capacity: number;
  private readonly codeFactory: () => string;
  private readonly now: () => Date;

  constructor(
    private readonly prisma: PrismaClient,
    options: RoomsServiceOptions = {}
  ) {
    this.capacity = options.capacity ?? DEFAULT_CAPACITY;
    this.codeFactory = options.codeFactory ?? defaultCodeFactory;
    this.now = options.now ?? (() => new Date());
  }

  async createRoom(user: AuthenticatedUser, input: CreateRoomInput): Promise<RoomDto> {
    const inviteCode = await this.generateUniqueInviteCode();
    const trimmedName = input.name?.trim();

    const room = await this.prisma.room.create({
      data: {
        name: trimmedName && trimmedName.length > 0 ? trimmedName : null,
        inviteCode,
        status: RoomStatus.LOBBY,
        capacity: this.capacity,
        hostId: user.id,
        memberships: {
          create: {
            userId: user.id,
            role: RoomMembershipRole.HOST,
            status: RoomMembershipStatus.ACTIVE,
            joinedAt: this.now()
          }
        }
      },
      include: ROOM_INCLUDE
    });

    const dto = this.toRoomDto(room, user.id);
    realtimeGateway.emitLobbyEvent(room.id, {
      type: 'ROOM_UPDATED',
      payload: dto
    });

    return dto;
  }

  async joinRoomByCode(user: AuthenticatedUser, inviteCode: string): Promise<RoomDto> {
    const normalisedCode = normaliseInviteCode(inviteCode);

    const { room, mutated } = await this.prisma.$transaction(async (tx) => {
      const existingRoom = await tx.room.findUnique({
        where: { inviteCode: normalisedCode },
        include: ROOM_INCLUDE
      });

      if (!existingRoom) {
        throw new HttpError(404, 'Invite code not found', 'INVALID_CODE');
      }

      const membership = existingRoom.memberships.find((entry) => entry.userId === user.id);

      const activeParticipantCount = existingRoom.memberships.filter(
        (entry) =>
          entry.status === RoomMembershipStatus.ACTIVE && entry.role !== RoomMembershipRole.SPECTATOR
      ).length;

      const countsTowardsCapacity = (entry: typeof membership): boolean =>
        entry?.role !== RoomMembershipRole.SPECTATOR;

      const isNewMembership = !membership;
      const isReactivating = membership ? membership.status !== RoomMembershipStatus.ACTIVE : false;

      if (
        ((isNewMembership && countsTowardsCapacity(undefined)) ||
          (isReactivating && countsTowardsCapacity(membership))) &&
        activeParticipantCount >= existingRoom.capacity
      ) {
        throw new HttpError(409, 'Room is full', 'ROOM_FULL');
      }

      let didMutate = false;

      if (!membership) {
        await tx.roomMembership.create({
          data: {
            roomId: existingRoom.id,
            userId: user.id,
            role: RoomMembershipRole.PLAYER,
            status: RoomMembershipStatus.ACTIVE,
            joinedAt: this.now()
          }
        });
        didMutate = true;
      } else if (membership.status !== RoomMembershipStatus.ACTIVE) {
        await tx.roomMembership.update({
          where: { id: membership.id },
          data: {
            status: RoomMembershipStatus.ACTIVE,
            leftAt: null,
            joinedAt: this.now()
          }
        });
        didMutate = true;
      }

      return { room: existingRoom, mutated: didMutate };
    });

    const refreshed = await this.fetchRoomById(room.id);
    const dto = this.toRoomDto(refreshed, user.id);

    if (mutated) {
      realtimeGateway.emitLobbyEvent(refreshed.id, {
        type: 'ROOM_UPDATED',
        payload: dto
      });
    }

    return dto;
  }

  async getRoom(user: AuthenticatedUser, roomId: string): Promise<RoomDto> {
    const room = await this.fetchRoomById(roomId);
    return this.toRoomDto(room, user.id);
  }

  private async fetchRoomById(roomId: string): Promise<RoomWithMemberships> {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: ROOM_INCLUDE
    });

    if (!room) {
      throw new HttpError(404, 'Room not found', 'ROOM_NOT_FOUND');
    }

    return room;
  }

  private async generateUniqueInviteCode(): Promise<string> {
    const MAX_ATTEMPTS = 10;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const candidate = normaliseInviteCode(this.codeFactory());
      if (candidate.length < 4) {
        continue;
      }

      const existing = await this.prisma.room.findUnique({
        where: { inviteCode: candidate }
      });

      if (!existing) {
        return candidate;
      }
    }

    throw new HttpError(500, 'Unable to allocate invite code', 'INVITE_CODE_ALLOCATION_FAILED');
  }

  private toRoomDto(room: RoomWithMemberships, viewerId: string): RoomDto {
    const members = room.memberships
      .slice()
      .sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime())
      .map<RoomMemberDto>((membership) => ({
        id: membership.userId,
        displayName: displayNameFor(membership.user),
        role: membership.role,
        status: membership.status,
        joinedAt: membership.joinedAt.toISOString()
      }));

    const viewerMembership = room.memberships.find((entry) => entry.userId === viewerId) ?? null;

    return {
      id: room.id,
      name: room.name,
      inviteCode: room.inviteCode,
      status: room.status,
      capacity: room.capacity,
      hostId: room.hostId,
      createdAt: room.createdAt.toISOString(),
      updatedAt: room.updatedAt.toISOString(),
      members,
      membership: viewerMembership
        ? {
            id: viewerMembership.id,
            userId: viewerMembership.userId,
            role: viewerMembership.role,
            status: viewerMembership.status,
            joinedAt: viewerMembership.joinedAt.toISOString()
          }
        : null
    };
  }
}

export const roomsService = new RoomsService(prismaClient);
