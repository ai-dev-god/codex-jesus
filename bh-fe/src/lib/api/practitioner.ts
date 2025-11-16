import { apiFetch } from './http';

export const approveAiInterpretation = (
  accessToken: string,
  email: string
): Promise<{ userId: string; approvedAt: string | null }> =>
  apiFetch<{ userId: string; approvedAt: string | null }>('/practitioner/ai-approvals', {
    method: 'POST',
    authToken: accessToken,
    body: JSON.stringify({ email })
  });

