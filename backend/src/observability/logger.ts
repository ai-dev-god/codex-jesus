import type { IncomingHttpHeaders } from 'http';

import env from '../config/env';

export type LogSeverity =
  | 'DEBUG'
  | 'INFO'
  | 'NOTICE'
  | 'WARNING'
  | 'ERROR'
  | 'CRITICAL'
  | 'ALERT'
  | 'EMERGENCY';

type HttpRequestLog = {
  requestMethod: string;
  requestUrl: string;
  status?: number;
  userAgent?: string;
  remoteIp?: string;
  latency?: string;
  protocol?: string;
  referer?: string;
};

type StructuredLogLabels = Record<string, string>;

export type StructuredLogPayload = {
  message: string;
  severity?: LogSeverity;
  time?: string;
  component?: string;
  context?: Record<string, unknown>;
  labels?: StructuredLogLabels;
  'logging.googleapis.com/trace'?: string;
  'logging.googleapis.com/spanId'?: string;
  httpRequest?: HttpRequestLog;
};

type LoggerContext = {
  component?: string;
  traceId?: string;
  spanId?: string;
  labels?: StructuredLogLabels;
  defaultFields?: Record<string, unknown>;
};

type LogOptions = {
  severity?: LogSeverity;
  labels?: StructuredLogLabels;
  context?: Record<string, unknown>;
  httpRequest?: HttpRequestLog;
  spanId?: string;
  traceId?: string;
};

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  with(options: Partial<Omit<LoggerContext, 'defaultFields'>> & { defaultFields?: Record<string, unknown> }): Logger;
  log(message: string, options?: LogOptions): void;
}

const CLOUD_PROJECT_ENV_KEYS = ['GCLOUD_PROJECT', 'GCP_PROJECT', 'GOOGLE_CLOUD_PROJECT', 'GCP_PROJECT_ID'] as const;

const resolveProjectId = (): string | undefined => {
  if (typeof env.GCP_PROJECT_ID === 'string' && env.GCP_PROJECT_ID.length > 0) {
    return env.GCP_PROJECT_ID;
  }

  for (const key of CLOUD_PROJECT_ENV_KEYS) {
    const value = process.env[key];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }

  return undefined;
};

const projectId = resolveProjectId();
const serviceName = 'biohax-backend';

const toTraceField = (traceId?: string): string | undefined => {
  if (!traceId) {
    return undefined;
  }

  if (!projectId || traceId.startsWith('projects/')) {
    return traceId;
  }

  return `projects/${projectId}/traces/${traceId}`;
};

const mergeLabels = (left?: StructuredLogLabels, right?: StructuredLogLabels): StructuredLogLabels | undefined => {
  if (!left && !right) {
    return undefined;
  }

  return {
    ...(left ?? {}),
    ...(right ?? {})
  };
};

const mergeContext = (
  left?: Record<string, unknown>,
  right?: Record<string, unknown>
): Record<string, unknown> | undefined => {
  if (!left && !right) {
    return undefined;
  }

  return {
    ...(left ?? {}),
    ...(right ?? {})
  };
};

const severityToConsole = (severity: LogSeverity | undefined): Pick<Console, 'log' | 'warn' | 'error'>['log'] => {
  if (!severity) {
    return console.log;
  }

  switch (severity) {
    case 'ERROR':
    case 'CRITICAL':
    case 'ALERT':
    case 'EMERGENCY':
      return console.error;
    case 'WARNING':
      return console.warn;
    default:
      return console.log;
  }
};

const serializeHeaders = (headers: IncomingHttpHeaders): Record<string, string | string[]> => {
  const output: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === 'undefined') {
      continue;
    }

    output[key] = value;
  }

  return output;
};

const normaliseHttpRequest = (payload?: HttpRequestLog): HttpRequestLog | undefined => {
  if (!payload) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => typeof value !== 'undefined')
  ) as HttpRequestLog;
};

class StructuredLogger implements Logger {
  constructor(private readonly context: LoggerContext = {}) {}

  with(options: Partial<Omit<LoggerContext, 'defaultFields'>> & { defaultFields?: Record<string, unknown> }): Logger {
    return new StructuredLogger({
      ...this.context,
      component: options.component ?? this.context.component,
      traceId: options.traceId ?? this.context.traceId,
      spanId: options.spanId ?? this.context.spanId,
      labels: mergeLabels(this.context.labels, options.labels),
      defaultFields: mergeContext(this.context.defaultFields, options.defaultFields)
    });
  }

  log(message: string, options: LogOptions = {}): void {
    const timestamp = new Date().toISOString();
    const severity: LogSeverity | undefined = options.severity;
    const traceId = options.traceId ?? this.context.traceId;
    const spanId = options.spanId ?? this.context.spanId;

    const payload: StructuredLogPayload = {
      message,
      severity,
      time: timestamp,
      component: this.context.component,
      context: mergeContext(this.context.defaultFields, options.context),
      labels: mergeLabels(this.context.labels, options.labels),
      'logging.googleapis.com/trace': toTraceField(traceId),
      'logging.googleapis.com/spanId': spanId,
      httpRequest: normaliseHttpRequest(options.httpRequest)
    };

    const entry = {
      serviceContext: {
        service: serviceName
      },
      ...payload
    };

    const writer = severityToConsole(severity);
    writer.call(console, JSON.stringify(entry));
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log(message, { severity: 'DEBUG', context });
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log(message, { severity: 'INFO', context });
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log(message, { severity: 'WARNING', context });
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.log(message, { severity: 'ERROR', context });
  }
}

export const createLogger = (context: LoggerContext = {}): Logger => new StructuredLogger(context);

export const baseLogger = createLogger({ component: 'backend' });

export type { HttpRequestLog, LoggerContext, StructuredLogLabels };
export { serializeHeaders };
