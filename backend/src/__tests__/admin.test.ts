import request from 'supertest';
import { FlagStatus, Role, UserStatus } from '@prisma/client';

import { app } from '../app';
import { tokenService } from '../modules/identity/token-service';
import { adminService } from '../modules/admin/admin.service';

jest.mock('../modules/admin/admin.service', () => ({
  adminService: {
    listFlags: jest.fn(),
    getFlag: jest.fn(),
    resolveFlag: jest.fn(),
    listAuditLogs: jest.fn(),
    listRoleAssignments: jest.fn(),
    updateUserRole: jest.fn(),
    getRoleHistory: jest.fn(),
    getSystemHealthSummary: jest.fn()
  }
}));

const mockedAdminService = adminService as jest.Mocked<typeof adminService>;

const issueToken = (role: Role) =>
  tokenService.issueAccessToken({
    id: `${role.toLowerCase()}-user`,
    email: `${role.toLowerCase()}@example.com`,
    role,
    status: UserStatus.ACTIVE
  }).token;

describe('Admin Router', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('requires authentication for admin moderation routes', async () => {
    const response = await request(app).get('/admin/flags');
    expect(response.status).toBe(401);
  });

  it('rejects members attempting to access admin moderation queues', async () => {
    const memberToken = issueToken(Role.MEMBER);
    const response = await request(app).get('/admin/flags').set('Authorization', `Bearer ${memberToken}`);
    expect(response.status).toBe(403);
  });

  it('returns flag queues for moderators', async () => {
    const moderatorToken = issueToken(Role.MODERATOR);
    mockedAdminService.listFlags.mockResolvedValueOnce({
      data: [
        {
          id: 'flag-1',
          status: FlagStatus.OPEN
        }
      ],
      meta: {
        nextCursor: null,
        hasMore: false
      }
    } as never);

    const response = await request(app)
      .get('/admin/flags')
      .query({ status: FlagStatus.OPEN, limit: 10 })
      .set('Authorization', `Bearer ${moderatorToken}`);

    expect(response.status).toBe(200);
    expect(mockedAdminService.listFlags).toHaveBeenCalledWith({
      status: FlagStatus.OPEN,
      cursor: undefined,
      limit: 10
    });
    expect(response.body).toMatchObject({
      data: expect.any(Array),
      meta: {
        nextCursor: null,
        hasMore: false
      }
    });
  });

  it('validates resolution payloads before invoking the service', async () => {
    const adminToken = issueToken(Role.ADMIN);
    const response = await request(app)
      .post('/admin/flags/flag-123/resolve')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'PENDING' });

    expect(response.status).toBe(422);
    expect(mockedAdminService.resolveFlag).not.toHaveBeenCalled();
  });

  it('resolves flags when payload is valid', async () => {
    const adminToken = issueToken(Role.ADMIN);
    mockedAdminService.resolveFlag.mockResolvedValueOnce({
      id: 'flag-123',
      status: FlagStatus.RESOLVED
    } as never);

    const response = await request(app)
      .post('/admin/flags/flag-123/resolve')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: FlagStatus.RESOLVED,
        resolutionNotes: 'Cleared after review'
      });

    expect(response.status).toBe(200);
    expect(mockedAdminService.resolveFlag).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'admin-user', role: Role.ADMIN }),
      'flag-123',
      expect.objectContaining({
        status: FlagStatus.RESOLVED,
        resolutionNotes: 'Cleared after review',
        metadata: null
      })
    );
  });

  it('exposes audit logs with filtering support', async () => {
    const moderatorToken = issueToken(Role.MODERATOR);
    mockedAdminService.listAuditLogs.mockResolvedValueOnce({
      data: [],
      meta: { nextCursor: null, hasMore: false }
    });

    const response = await request(app)
      .get('/admin/audit')
      .query({ actorId: 'admin-1', action: 'USER_ROLE_UPDATED' })
      .set('Authorization', `Bearer ${moderatorToken}`);

    expect(response.status).toBe(200);
    expect(mockedAdminService.listAuditLogs).toHaveBeenCalledWith({
      actorId: 'admin-1',
      action: 'USER_ROLE_UPDATED',
      from: undefined,
      to: undefined,
      cursor: undefined,
      limit: 20
    });
  });

  it('returns current role assignments', async () => {
    const adminToken = issueToken(Role.ADMIN);
    mockedAdminService.listRoleAssignments.mockResolvedValueOnce({
      data: [
        {
          user: {
            id: 'user-1',
            email: 'mod@example.com',
            role: Role.MODERATOR
          },
          recentHistory: []
        }
      ]
    } as never);

    const response = await request(app)
      .get('/admin/roles')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(mockedAdminService.listRoleAssignments).toHaveBeenCalledTimes(1);
  });

  it('prevents moderators from mutating role assignments', async () => {
    const moderatorToken = issueToken(Role.MODERATOR);
    const response = await request(app)
      .post('/admin/roles/user-123')
      .set('Authorization', `Bearer ${moderatorToken}`)
      .send({ role: Role.MODERATOR });

    expect(response.status).toBe(403);
    expect(mockedAdminService.updateUserRole).not.toHaveBeenCalled();
  });

  it('updates role assignments when requested by an admin', async () => {
    const adminToken = issueToken(Role.ADMIN);
    mockedAdminService.updateUserRole.mockResolvedValueOnce({
      user: {
        id: 'user-123',
        role: Role.MODERATOR
      },
      recentHistory: []
    } as never);

    const response = await request(app)
      .post('/admin/roles/user-123')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: Role.MODERATOR });

    expect(response.status).toBe(200);
    expect(mockedAdminService.updateUserRole).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'admin-user', role: Role.ADMIN }),
      'user-123',
      { role: Role.MODERATOR }
    );
  });

  it('returns role assignment history scoped to a user', async () => {
    const adminToken = issueToken(Role.ADMIN);
    mockedAdminService.getRoleHistory.mockResolvedValueOnce({
      data: [],
      meta: { nextCursor: null, hasMore: false }
    });

    const response = await request(app)
      .get('/admin/roles/user-123/history')
      .query({ limit: 5 })
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(mockedAdminService.getRoleHistory).toHaveBeenCalledWith('user-123', {
      limit: 5,
      cursor: undefined
    });
  });

  it('surfaces system health summary to administrators', async () => {
    const adminToken = issueToken(Role.ADMIN);
    mockedAdminService.getSystemHealthSummary.mockResolvedValueOnce({
      generatedAt: '2025-02-01T12:00:00.000Z',
      queues: {
        totalPending: 1
      }
    } as never);

    const response = await request(app)
      .get('/admin/system-health')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(mockedAdminService.getSystemHealthSummary).toHaveBeenCalledTimes(1);
  });
});
