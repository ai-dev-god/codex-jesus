import { Role, UserStatus } from '@prisma/client';
import request from 'supertest';

import { app } from '../app';
import { tokenService } from '../modules/identity/token-service';
import { whoopService } from '../modules/wearable/whoop.service';

jest.mock('../modules/wearable/whoop.service', () => {
  return {
    whoopService: {
      getStatus: jest.fn(),
      handleLinkRequest: jest.fn(),
      unlink: jest.fn()
    }
  };
});

const issueToken = () =>
  tokenService.issueAccessToken({
    id: 'user-1',
    email: 'member@example.com',
    role: Role.MEMBER,
    status: UserStatus.ACTIVE
  }).token;

describe('Whoop integration routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('requires authentication for status endpoint', async () => {
    const response = await request(app).get('/integrations/whoop/status');
    expect(response.status).toBe(401);
  });

  it('returns integration status for authenticated requests', async () => {
    const token = issueToken();
    (whoopService.getStatus as jest.Mock).mockResolvedValue({
      linked: false,
      linkUrl: 'https://auth.example.com',
      state: 'state-xyz',
      expiresAt: '2025-01-01T00:10:00.000Z',
      lastSyncAt: null,
      syncStatus: 'PENDING'
    });

    const response = await request(app)
      .get('/integrations/whoop/status')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(whoopService.getStatus).toHaveBeenCalledWith('user-1');
    expect(response.body).toMatchObject({ linked: false });
  });

  it('handles link requests and forwards payload to service', async () => {
    const token = issueToken();
    (whoopService.handleLinkRequest as jest.Mock).mockResolvedValue({
      linked: true,
      linkUrl: null,
      state: null,
      expiresAt: null,
      lastSyncAt: '2025-01-01T00:10:00.000Z',
      syncStatus: 'ACTIVE'
    });

    const response = await request(app)
      .post('/integrations/whoop/link')
      .set('Authorization', `Bearer ${token}`)
      .send({ authorizationCode: 'auth-code', state: 'state-xyz' });

    expect(response.status).toBe(200);
    expect(whoopService.handleLinkRequest).toHaveBeenCalledWith('user-1', {
      authorizationCode: 'auth-code',
      state: 'state-xyz'
    });
  });

  it('unlinks integration and returns 204', async () => {
    const token = issueToken();
    (whoopService.unlink as jest.Mock).mockResolvedValue(undefined);

    const response = await request(app)
      .delete('/integrations/whoop')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(204);
    expect(whoopService.unlink).toHaveBeenCalledWith('user-1');
  });
});
