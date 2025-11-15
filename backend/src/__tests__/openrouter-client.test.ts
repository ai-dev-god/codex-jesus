import { HttpError } from '../modules/observability-ops/http-error';
import { createOpenRouterClient } from '../lib/openrouter';

describe('OpenRouterClient', () => {
  const baseMessages = [
    { role: 'system' as const, content: 'You are helpful.' },
    { role: 'user' as const, content: 'Say hello as JSON.' }
  ];

  const createFetchResponse = (status: number, body: unknown) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('throws when API key is missing', async () => {
    const client = createOpenRouterClient({
      apiKey: null,
      fetchImpl: jest.fn()
    });

    await expect(
      client.createChatCompletion({
        model: 'test-model',
        messages: baseMessages
      })
    ).rejects.toMatchObject({
      status: 503,
      code: 'INSIGHT_PROVIDER_FAILURE'
    } satisfies Partial<HttpError>);
  });

  it('sends chat completions and returns the first choice content', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(
        createFetchResponse(200, {
          id: 'cmpl-1',
          choices: [
            {
              message: {
                role: 'assistant',
                content: '{"message":"hello"}'
              }
            }
          ]
        })
      );
    const client = createOpenRouterClient({
      apiKey: 'test-key',
      fetchImpl
    });

    const result = await client.createChatCompletion({
      model: 'test-model',
      messages: baseMessages,
      temperature: 0.3
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-key'
        })
      })
    );
    expect(result).toMatchObject({
      id: 'cmpl-1',
      content: '{"message":"hello"}',
      model: 'test-model'
    });
  });

  it('enforces a basic token bucket rate limit', async () => {
    const client = createOpenRouterClient({
      apiKey: 'test-key',
      fetchImpl: jest
        .fn()
        .mockResolvedValue(
          createFetchResponse(200, {
            id: 'cmpl-1',
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: '{"ok":true}'
                }
              }
            ]
          })
        ),
      rateLimit: {
        capacity: 2,
        windowMs: 60_000
      }
    });

    await client.createChatCompletion({ model: 'test-model', messages: baseMessages });
    await client.createChatCompletion({ model: 'test-model', messages: baseMessages });

    await expect(
      client.createChatCompletion({ model: 'test-model', messages: baseMessages })
    ).rejects.toMatchObject({
      status: 429,
      code: 'INSIGHT_RATE_LIMITED'
    } satisfies Partial<HttpError>);
  });
});
