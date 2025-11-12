import { BiomarkerSource, Role, UserStatus } from '@prisma/client';
import request from 'supertest';

import { app } from '../app';
import { biomarkerService } from '../modules/biomarkers/biomarker.service';
import { tokenService } from '../modules/identity/token-service';

jest.mock('../modules/biomarkers/biomarker.service', () => ({
  biomarkerService: {
    listDefinitions: jest.fn(),
    getDefinition: jest.fn(),
    createDefinition: jest.fn(),
    updateDefinition: jest.fn(),
    deleteDefinition: jest.fn(),
    listLogs: jest.fn(),
    createManualLog: jest.fn(),
    updateManualLog: jest.fn(),
    deleteManualLog: jest.fn()
  }
}));

const issueToken = (overrides: Partial<{ role: Role; status: UserStatus }> = {}) =>
  tokenService.issueAccessToken({
    id: 'user-1',
    email: 'member@example.com',
    role: overrides.role ?? Role.MEMBER,
    status: overrides.status ?? UserStatus.ACTIVE
  }).token;

describe('Biomarker routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('definitions', () => {
    it('requires authentication to list definitions', async () => {
      const response = await request(app).get('/biomarkers');
      expect(response.status).toBe(401);
    });

    it('returns biomarker definitions for active members', async () => {
      (biomarkerService.listDefinitions as jest.Mock).mockResolvedValue([
        {
          id: 'b1',
          slug: 'hrv',
          name: 'HRV',
          unit: 'ms',
          referenceLow: 60,
          referenceHigh: 120,
          source: BiomarkerSource.MANUAL,
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-02T00:00:00.000Z'
        }
      ]);

      const response = await request(app)
        .get('/biomarkers')
        .set('Authorization', `Bearer ${issueToken()}`);

      expect(response.status).toBe(200);
      expect(biomarkerService.listDefinitions).toHaveBeenCalledTimes(1);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].slug).toBe('hrv');
    });

    it('retrieves a specific biomarker by identifier', async () => {
      (biomarkerService.getDefinition as jest.Mock).mockResolvedValue({
        id: 'b1',
        slug: 'hrv',
        name: 'HRV',
        unit: 'ms',
        referenceLow: 60,
        referenceHigh: 120,
        source: BiomarkerSource.MANUAL,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-02T00:00:00.000Z'
      });

      const response = await request(app)
        .get('/biomarkers/hrv')
        .set('Authorization', `Bearer ${issueToken()}`);

      expect(response.status).toBe(200);
      expect(biomarkerService.getDefinition).toHaveBeenCalledWith('hrv');
      expect(response.body.slug).toBe('hrv');
    });

    it('requires admin role to create a definition', async () => {
      const response = await request(app)
        .post('/biomarkers')
        .set('Authorization', `Bearer ${issueToken()}`)
        .send({
          slug: 'new-biomarker',
          name: 'New Biomarker',
          unit: 'ng/dL',
          referenceLow: 10,
          referenceHigh: 20,
          source: BiomarkerSource.MANUAL
        });

      expect(response.status).toBe(403);
      expect(biomarkerService.createDefinition).not.toHaveBeenCalled();
    });

    it('creates biomarker definition with optimistic concurrency metadata', async () => {
      (biomarkerService.createDefinition as jest.Mock).mockResolvedValue({
        id: 'b-new',
        slug: 'new-biomarker',
        name: 'New Biomarker',
        unit: 'ng/dL',
        referenceLow: 10,
        referenceHigh: 20,
        source: BiomarkerSource.MANUAL,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z'
      });

      const response = await request(app)
        .post('/biomarkers')
        .set('Authorization', `Bearer ${issueToken({ role: Role.ADMIN })}`)
        .send({
          slug: 'new-biomarker',
          name: 'New Biomarker',
          unit: 'ng/dL',
          referenceLow: 10,
          referenceHigh: 20,
          source: BiomarkerSource.MANUAL
        });

      expect(response.status).toBe(201);
      expect(biomarkerService.createDefinition).toHaveBeenCalledTimes(1);
      const [, args] = (biomarkerService.createDefinition as jest.Mock).mock.calls[0];
      expect(args).toMatchObject({
        slug: 'new-biomarker',
        unit: 'ng/dL'
      });
    });

    it('validates reference range ordering', async () => {
      const response = await request(app)
        .post('/biomarkers')
        .set('Authorization', `Bearer ${issueToken({ role: Role.ADMIN })}`)
        .send({
          slug: 'bad-range',
          name: 'Bad Range',
          unit: 'mg/dL',
          referenceLow: 30,
          referenceHigh: 20,
          source: BiomarkerSource.MANUAL
        });

      expect(response.status).toBe(422);
      expect(biomarkerService.createDefinition).not.toHaveBeenCalled();
    });

    it('updates biomarker definition with concurrency token', async () => {
      (biomarkerService.updateDefinition as jest.Mock).mockResolvedValue({
        id: 'b1',
        slug: 'hrv',
        name: 'HRV',
        unit: 'ms',
        referenceLow: 55,
        referenceHigh: 120,
        source: BiomarkerSource.MANUAL,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-02T00:00:00.000Z'
      });

      const expectedUpdatedAt = '2025-01-01T00:00:00.000Z';

      const response = await request(app)
        .patch('/biomarkers/hrv')
        .set('Authorization', `Bearer ${issueToken({ role: Role.ADMIN })}`)
        .send({
          referenceLow: 55,
          expectedUpdatedAt
        });

      expect(response.status).toBe(200);
      expect(biomarkerService.updateDefinition).toHaveBeenCalledTimes(1);
      const [, , payload] = (biomarkerService.updateDefinition as jest.Mock).mock.calls[0];
      expect(payload.referenceLow).toBe(55);
      expect(payload.expectedUpdatedAt).toBeInstanceOf(Date);
      expect((payload.expectedUpdatedAt as Date).toISOString()).toBe(expectedUpdatedAt);
    });

    it('deletes biomarker definition with optimistic guard', async () => {
      const expectedUpdatedAt = '2025-01-02T00:00:00.000Z';

      const response = await request(app)
        .delete('/biomarkers/hrv')
        .query({ expectedUpdatedAt })
        .set('Authorization', `Bearer ${issueToken({ role: Role.ADMIN })}`);

      expect(response.status).toBe(204);
      expect(biomarkerService.deleteDefinition).toHaveBeenCalledWith(
        'user-1',
        'hrv',
        expect.any(Date)
      );
      const [, , dateArg] = (biomarkerService.deleteDefinition as jest.Mock).mock.calls[0];
      expect((dateArg as Date).toISOString()).toBe(expectedUpdatedAt);
    });
  });

  describe('manual logs', () => {
    it('requires authentication to list manual logs', async () => {
      const response = await request(app).get('/biomarker-logs');
      expect(response.status).toBe(401);
    });

    it('lists manual logs with pagination meta', async () => {
      (biomarkerService.listLogs as jest.Mock).mockResolvedValue({
        data: [
          {
            id: 'log-1',
            biomarkerId: 'b1',
            biomarker: {
              id: 'b1',
              slug: 'hrv',
              name: 'HRV',
              unit: 'ms',
              referenceLow: 60,
              referenceHigh: 120,
              source: BiomarkerSource.MANUAL,
              createdAt: '2025-01-01T00:00:00.000Z',
              updatedAt: '2025-01-02T00:00:00.000Z'
            },
            value: 70,
            unit: 'ms',
            source: BiomarkerSource.MANUAL,
            capturedAt: '2025-01-02T12:00:00.000Z',
            accepted: true,
            flagged: false,
            notes: null,
            createdAt: '2025-01-02T12:00:01.000Z',
            updatedAt: '2025-01-02T12:00:01.000Z'
          }
        ],
        nextCursor: null
      });

      const response = await request(app)
        .get('/biomarker-logs')
        .set('Authorization', `Bearer ${issueToken()}`);

      expect(response.status).toBe(200);
      expect(response.body.meta.hasMore).toBe(false);
      expect(biomarkerService.listLogs).toHaveBeenCalledWith('user-1', {
        biomarkerId: undefined,
        cursor: undefined,
        limit: 20
      });
    });

    it('creates manual log entries and enforces positive values', async () => {
      (biomarkerService.createManualLog as jest.Mock).mockResolvedValue({
        id: 'log-2',
        biomarkerId: 'b1',
        biomarker: {
          id: 'b1',
          slug: 'hrv',
          name: 'HRV',
          unit: 'ms',
          referenceLow: 60,
          referenceHigh: 120,
          source: BiomarkerSource.MANUAL,
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-02T00:00:00.000Z'
        },
        value: 75,
        unit: 'ms',
        source: BiomarkerSource.MANUAL,
        capturedAt: '2025-01-03T12:00:00.000Z',
        accepted: true,
        flagged: false,
        notes: null,
        createdAt: '2025-01-03T12:00:01.000Z',
        updatedAt: '2025-01-03T12:00:01.000Z'
      });

      const response = await request(app)
        .post('/biomarker-logs')
        .set('Authorization', `Bearer ${issueToken()}`)
        .send({
          biomarkerId: 'b1',
          value: 75,
          unit: 'ms',
          capturedAt: '2025-01-03T12:00:00.000Z',
          source: BiomarkerSource.MANUAL
        });

      expect(response.status).toBe(201);
      expect(biomarkerService.createManualLog).toHaveBeenCalledTimes(1);
      const [, payload] = (biomarkerService.createManualLog as jest.Mock).mock.calls[0];
      expect(payload.value).toBe(75);
      expect(payload.capturedAt).toBeInstanceOf(Date);
      expect(payload.capturedAt.toISOString()).toBe('2025-01-03T12:00:00.000Z');
    });

    it('rejects manual log submissions with non-positive values', async () => {
      const response = await request(app)
        .post('/biomarker-logs')
        .set('Authorization', `Bearer ${issueToken()}`)
        .send({
          biomarkerId: 'b1',
          value: 0,
          unit: 'ms',
          capturedAt: '2025-01-03T12:00:00.000Z',
          source: BiomarkerSource.MANUAL
        });

      expect(response.status).toBe(422);
      expect(biomarkerService.createManualLog).not.toHaveBeenCalled();
    });

    it('updates manual logs with concurrency token', async () => {
      (biomarkerService.updateManualLog as jest.Mock).mockResolvedValue({
        id: 'log-1',
        biomarkerId: 'b1',
        biomarker: {
          id: 'b1',
          slug: 'hrv',
          name: 'HRV',
          unit: 'ms',
          referenceLow: 60,
          referenceHigh: 120,
          source: BiomarkerSource.MANUAL,
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-02T00:00:00.000Z'
        },
        value: 80,
        unit: 'ms',
        source: BiomarkerSource.MANUAL,
        capturedAt: '2025-01-02T13:00:00.000Z',
        accepted: true,
        flagged: false,
        notes: null,
        createdAt: '2025-01-02T12:00:01.000Z',
        updatedAt: '2025-01-02T13:00:01.000Z'
      });

      const expectedUpdatedAt = '2025-01-02T12:00:01.000Z';

      const response = await request(app)
        .patch('/biomarker-logs/log-1')
        .set('Authorization', `Bearer ${issueToken()}`)
        .send({
          value: 80,
          expectedUpdatedAt
        });

      expect(response.status).toBe(200);
      expect(biomarkerService.updateManualLog).toHaveBeenCalledWith('user-1', 'log-1', {
        value: 80,
        expectedUpdatedAt: expect.any(Date)
      });
      const [, , payload] = (biomarkerService.updateManualLog as jest.Mock).mock.calls[0];
      expect((payload.expectedUpdatedAt as Date).toISOString()).toBe(expectedUpdatedAt);
    });

    it('deletes manual logs with optimistic guard', async () => {
      const expectedUpdatedAt = '2025-01-02T12:00:01.000Z';

      const response = await request(app)
        .delete('/biomarker-logs/log-1')
        .query({ expectedUpdatedAt })
        .set('Authorization', `Bearer ${issueToken()}`);

      expect(response.status).toBe(204);
      expect(biomarkerService.deleteManualLog).toHaveBeenCalledWith(
        'user-1',
        'log-1',
        expect.any(Date)
      );
      const [, , dateArg] = (biomarkerService.deleteManualLog as jest.Mock).mock.calls[0];
      expect((dateArg as Date).toISOString()).toBe(expectedUpdatedAt);
    });
  });
});
