import { randomBytes } from 'crypto';

export type TraceContext = {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name?: string;
  startTime: string;
  endTime?: string;
  attributes?: Record<string, unknown>;
};

const TRACE_ID_BYTES = 16;
const SPAN_ID_BYTES = 8;

const randomHex = (bytes: number): string => randomBytes(bytes).toString('hex');

export const createTraceContext = (name?: string, parent?: TraceContext): TraceContext => ({
  traceId: parent?.traceId ?? randomHex(TRACE_ID_BYTES),
  spanId: randomHex(SPAN_ID_BYTES),
  parentSpanId: parent?.spanId,
  name,
  startTime: new Date().toISOString(),
  attributes: {}
});

export const finishTraceContext = (trace: TraceContext, attributes?: Record<string, unknown>): TraceContext => {
  trace.endTime = new Date().toISOString();
  if (attributes) {
    trace.attributes = {
      ...(trace.attributes ?? {}),
      ...attributes
    };
  }

  return trace;
};
