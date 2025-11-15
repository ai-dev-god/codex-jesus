import fetch from 'node-fetch';

const REQUIRED_AUDIENCE = process.env.EXPECTED_CLIENT_ID ?? '';
const TOKEN = process.env.TEST_ID_TOKEN ?? '';
const TIMEOUT_MS = Number(process.env.HTTP_TIMEOUT_MS ?? '10000');

if (!REQUIRED_AUDIENCE) {
  console.error('Missing EXPECTED_CLIENT_ID env var');
  process.exit(2);
}

if (!TOKEN) {
  console.error('Missing TEST_ID_TOKEN env var');
  process.exit(2);
}

async function main() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const url = new URL('https://oauth2.googleapis.com/tokeninfo');
    url.searchParams.set('id_token', TOKEN);

    const response = await fetch(url.toString(), {
      signal: controller.signal
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`tokeninfo returned ${response.status}: ${body}`);
    }

    const payload = (await response.json()) as {
      aud?: string;
      exp?: string;
      iss?: string;
      [key: string]: unknown;
    };

    if (payload.aud !== REQUIRED_AUDIENCE) {
      throw new Error(
        `Audience mismatch. Expected ${REQUIRED_AUDIENCE} but got ${payload.aud ?? 'undefined'}`
      );
    }

    const expiresAt = payload.exp ? new Date(Number(payload.exp) * 1000) : undefined;
    const issuer = payload.iss ?? 'unknown';

    console.log(
      JSON.stringify(
        {
          message: 'Google token verification succeeded',
          aud: payload.aud,
          iss: issuer,
          expiresAt
        },
        null,
        2
      )
    );
  } catch (error) {
    console.error('Google token verification failed', error);
    process.exit(1);
  } finally {
    clearTimeout(timeout);
  }
}

main();

