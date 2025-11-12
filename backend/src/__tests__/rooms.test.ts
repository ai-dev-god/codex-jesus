import request from 'supertest';
import { RoomMembershipRole, RoomMembershipStatus, RoomStatus, Role, UserStatus } from '@prisma/client';

import { app } from '../app';
import { tokenService } from '../modules/identity/token-service';
import { roomsService } from '../modules/rooms/rooms.service';

jest.mock('../modules/rooms/rooms.service', () => ({
  roomsService: {
    createRoom: jest.fn(),
    joinRoomByCode: jest.fn(),
    getRoom: jest.fn()
  }
}));

const mockedRoomsService = roomsService as jest.Mocked<typeof roomsService>;

const issueToken = (status: UserStatus) =>
  tokenService.issueAccessToken({
    id: 'rooms-user',
    email: 'rooms@example.com',
    role: Role.MEMBER,
    status
  }).token;

describe('Rooms Router', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('requires authentication to create a room', async () => {
    const response = await request(app).post('/rooms').send({ name: 'Recovery Sprint' });
    expect(response.status).toBe(401);
    expect(mockedRoomsService.createRoom).not.toHaveBeenCalled();
  });

  it('requires an active member to create a room', async () => {
    const token = issueToken(UserStatus.PENDING_ONBOARDING);

    const response = await request(app).post('/rooms').set('Authorization', `Bearer ${token}`).send({ name: 'Sprint' });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      error: {
        code: 'ONBOARDING_REQUIRED'
      }
    });
    expect(mockedRoomsService.createRoom).not.toHaveBeenCalled();
  });

  it('validates room creation payloads', async () => {
    const token = issueToken(UserStatus.ACTIVE);

    const response = await request(app)
      .post('/rooms')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '' });

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR'
      }
    });
    expect(mockedRoomsService.createRoom).not.toHaveBeenCalled();
  });

  it('creates rooms via the service and returns payload', async () => {
    const token = issueToken(UserStatus.ACTIVE);
    mockedRoomsService.createRoom.mockResolvedValueOnce({
      id: 'room-1',
      name: 'Recovery Sprint',
      inviteCode: 'ABC123',
      status: RoomStatus.LOBBY,
      capacity: 8,
      hostId: 'rooms-user',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      members: [],
      membership: {
        id: 'membership-1',
        userId: 'rooms-user',
        role: RoomMembershipRole.HOST,
        status: RoomMembershipStatus.ACTIVE,
        joinedAt: '2025-01-01T00:00:00.000Z'
      }
    });

    const response = await request(app)
      .post('/rooms')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Recovery Sprint' });

    expect(response.status).toBe(201);
    expect(mockedRoomsService.createRoom).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'rooms-user' }),
      expect.objectContaining({ name: 'Recovery Sprint' })
    );
    expect(response.body).toMatchObject({
      id: 'room-1',
      inviteCode: 'ABC123'
    });
  });

  it('validates invite codes on join', async () => {
    const token = issueToken(UserStatus.ACTIVE);

    const response = await request(app)
      .post('/rooms/join')
      .set('Authorization', `Bearer ${token}`)
      .send({ inviteCode: '123' });

    expect(response.status).toBe(422);
    expect(mockedRoomsService.joinRoomByCode).not.toHaveBeenCalled();
  });

  it('joins rooms via the service when invite code is valid', async () => {
    const token = issueToken(UserStatus.ACTIVE);
    mockedRoomsService.joinRoomByCode.mockResolvedValueOnce({
      id: 'room-2',
      name: 'Sprint',
      inviteCode: 'JOIN42',
      status: RoomStatus.LOBBY,
      capacity: 6,
      hostId: 'host-rooms',
      createdAt: '2025-01-02T00:00:00.000Z',
      updatedAt: '2025-01-02T00:00:00.000Z',
      members: [],
      membership: {
        id: 'membership-2',
        userId: 'rooms-user',
        role: RoomMembershipRole.PLAYER,
        status: RoomMembershipStatus.ACTIVE,
        joinedAt: '2025-01-02T00:00:00.000Z'
      }
    });

    const response = await request(app)
      .post('/rooms/join')
      .set('Authorization', `Bearer ${token}`)
      .send({ inviteCode: 'JOIN42' });

    expect(response.status).toBe(200);
    expect(mockedRoomsService.joinRoomByCode).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'rooms-user' }),
      'JOIN42'
    );
  });

  it('requires authentication to fetch a room', async () => {
    const response = await request(app).get('/rooms/room-1');
    expect(response.status).toBe(401);
    expect(mockedRoomsService.getRoom).not.toHaveBeenCalled();
  });

  it('fetches rooms via the service', async () => {
    const token = issueToken('ACTIVE');

    mockedRoomsService.getRoom.mockResolvedValueOnce({
      id: 'room-lookup',
      name: 'Sprint',
      inviteCode: 'LOOKUP',
      status: RoomStatus.LOBBY,
      capacity: 8,
      hostId: 'host-lookup',
      createdAt: '2025-01-03T00:00:00.000Z',
      updatedAt: '2025-01-03T00:00:00.000Z',
      members: [],
      membership: {
        id: 'membership-3',
        userId: 'rooms-user',
        role: RoomMembershipRole.PLAYER,
        status: RoomMembershipStatus.ACTIVE,
        joinedAt: '2025-01-03T00:00:00.000Z'
      }
    });

    const response = await request(app).get('/rooms/room-lookup').set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(mockedRoomsService.getRoom).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'rooms-user' }),
      'room-lookup'
    );
  });
});
