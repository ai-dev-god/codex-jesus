"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.roomsService = exports.RoomsService = void 0;
const crypto_1 = require("crypto");
const client_1 = require("@prisma/client");
const prisma_1 = __importDefault(require("../../lib/prisma"));
const http_error_1 = require("../observability-ops/http-error");
const gateway_1 = require("../../realtime/gateway");
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
};
const defaultCodeFactory = () => {
    const raw = (0, crypto_1.randomBytes)(4).toString('base64').toUpperCase().replace(/[^A-Z0-9]/g, '');
    return raw.slice(0, 8);
};
const normaliseInviteCode = (code) => code.trim().toUpperCase();
const displayNameFor = (user) => user.profile?.displayName ?? user.email;
class RoomsService {
    constructor(prisma, options = {}) {
        this.prisma = prisma;
        this.capacity = options.capacity ?? DEFAULT_CAPACITY;
        this.codeFactory = options.codeFactory ?? defaultCodeFactory;
        this.now = options.now ?? (() => new Date());
    }
    async createRoom(user, input) {
        const inviteCode = await this.generateUniqueInviteCode();
        const trimmedName = input.name?.trim();
        const room = await this.prisma.room.create({
            data: {
                name: trimmedName && trimmedName.length > 0 ? trimmedName : null,
                inviteCode,
                status: client_1.RoomStatus.LOBBY,
                capacity: this.capacity,
                hostId: user.id,
                memberships: {
                    create: {
                        userId: user.id,
                        role: client_1.RoomMembershipRole.HOST,
                        status: client_1.RoomMembershipStatus.ACTIVE,
                        joinedAt: this.now()
                    }
                }
            },
            include: ROOM_INCLUDE
        });
        const dto = this.toRoomDto(room, user.id);
        gateway_1.realtimeGateway.emitLobbyEvent(room.id, {
            type: 'ROOM_UPDATED',
            payload: dto
        });
        return dto;
    }
    async joinRoomByCode(user, inviteCode) {
        const normalisedCode = normaliseInviteCode(inviteCode);
        const { room, mutated } = await this.prisma.$transaction(async (tx) => {
            const existingRoom = await tx.room.findUnique({
                where: { inviteCode: normalisedCode },
                include: ROOM_INCLUDE
            });
            if (!existingRoom) {
                throw new http_error_1.HttpError(404, 'Invite code not found', 'INVALID_CODE');
            }
            const membership = existingRoom.memberships.find((entry) => entry.userId === user.id);
            const activeParticipantCount = existingRoom.memberships.filter((entry) => entry.status === client_1.RoomMembershipStatus.ACTIVE && entry.role !== client_1.RoomMembershipRole.SPECTATOR).length;
            const countsTowardsCapacity = (entry) => entry?.role !== client_1.RoomMembershipRole.SPECTATOR;
            const isNewMembership = !membership;
            const isReactivating = membership ? membership.status !== client_1.RoomMembershipStatus.ACTIVE : false;
            if (((isNewMembership && countsTowardsCapacity(undefined)) ||
                (isReactivating && countsTowardsCapacity(membership))) &&
                activeParticipantCount >= existingRoom.capacity) {
                throw new http_error_1.HttpError(409, 'Room is full', 'ROOM_FULL');
            }
            let didMutate = false;
            if (!membership) {
                await tx.roomMembership.create({
                    data: {
                        roomId: existingRoom.id,
                        userId: user.id,
                        role: client_1.RoomMembershipRole.PLAYER,
                        status: client_1.RoomMembershipStatus.ACTIVE,
                        joinedAt: this.now()
                    }
                });
                didMutate = true;
            }
            else if (membership.status !== client_1.RoomMembershipStatus.ACTIVE) {
                await tx.roomMembership.update({
                    where: { id: membership.id },
                    data: {
                        status: client_1.RoomMembershipStatus.ACTIVE,
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
            gateway_1.realtimeGateway.emitLobbyEvent(refreshed.id, {
                type: 'ROOM_UPDATED',
                payload: dto
            });
        }
        return dto;
    }
    async getRoom(user, roomId) {
        const room = await this.fetchRoomById(roomId);
        return this.toRoomDto(room, user.id);
    }
    async fetchRoomById(roomId) {
        const room = await this.prisma.room.findUnique({
            where: { id: roomId },
            include: ROOM_INCLUDE
        });
        if (!room) {
            throw new http_error_1.HttpError(404, 'Room not found', 'ROOM_NOT_FOUND');
        }
        return room;
    }
    async generateUniqueInviteCode() {
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
        throw new http_error_1.HttpError(500, 'Unable to allocate invite code', 'INVITE_CODE_ALLOCATION_FAILED');
    }
    toRoomDto(room, viewerId) {
        const members = room.memberships
            .slice()
            .sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime())
            .map((membership) => ({
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
exports.RoomsService = RoomsService;
exports.roomsService = new RoomsService(prisma_1.default);
