import { baseLogger } from '../../observability/logger';

type AlertPayload = Record<string, unknown>;

export interface AlertingClient {
  notify(event: string, payload: AlertPayload): Promise<void>;
}

class StructuredAlertingClient implements AlertingClient {
  constructor(private readonly logger = baseLogger.with({ component: 'alerting' })) {}

  async notify(event: string, payload: AlertPayload): Promise<void> {
    this.logger.error(`Alert triggered: ${event}`, payload);
  }
}

export const alerting: AlertingClient = new StructuredAlertingClient();
