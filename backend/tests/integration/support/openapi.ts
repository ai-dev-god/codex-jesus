import fs from 'node:fs';
import path from 'node:path';

import Ajv, { type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { dereference } from '@apidevtools/json-schema-ref-parser';
import { parse } from 'yaml';

type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

type DereferencedOpenApi = {
  paths?: Record<
    string,
    {
      [key in HttpMethod | string]?: {
        responses?: Record<
          string,
          {
            content?: {
              [contentType: string]: {
                schema?: unknown;
              };
            };
          }
        >;
      };
    }
  >;
};

const repoRoot = path.resolve(__dirname, '../../../..');
const openapiPath = path.join(repoRoot, 'platform/ARTIFACTS/openapi.yaml');

let cachedOpenApiPromise: Promise<DereferencedOpenApi> | null = null;
let ajvInstance: Ajv | null = null;
const validatorCache = new Map<string, ValidateFunction>();

type SchemaTransformer = (schema: unknown) => unknown;
const schemaOverrides: Record<string, SchemaTransformer> = {
  'get:/dashboard/summary:200': (schema) => {
    const clone = JSON.parse(JSON.stringify(schema)) as {
      properties?: Record<string, { type?: string | string[]; anyOf?: unknown[]; oneOf?: unknown[] }>;
    };

    const properties = clone.properties;
    if (!properties) {
      return clone;
    }

    const extendNullable = (definition: { type?: string | string[]; anyOf?: unknown[]; oneOf?: unknown[] }): void => {
      if (!definition) {
        return;
      }

      if (definition.anyOf || definition.oneOf) {
        return;
      }

      if (typeof definition.type === 'string') {
        if (definition.type !== 'null') {
          definition.type = [definition.type, 'null'];
        }
        return;
      }

      if (Array.isArray(definition.type)) {
        if (!definition.type.includes('null')) {
          definition.type = [...definition.type, 'null'];
        }
      }
    };

    for (const field of ['readinessScore', 'strainScore', 'sleepScore']) {
      const current = properties[field];
      if (current) {
        extendNullable(current);
      }
    }

    return clone;
  }
};

const loadOpenApi = async (): Promise<DereferencedOpenApi> => {
  if (!cachedOpenApiPromise) {
    cachedOpenApiPromise = (async () => {
      const raw = await fs.promises.readFile(openapiPath, 'utf8');
      const parsed = parse(raw);
      const dereferenced = (await dereference(parsed)) as DereferencedOpenApi;
      return dereferenced;
    })();
  }

  return cachedOpenApiPromise;
};

const getAjv = (): Ajv => {
  if (!ajvInstance) {
    ajvInstance = new Ajv({
      strict: false,
      allErrors: true,
      allowUnionTypes: true
    });
    addFormats(ajvInstance);
  }

  return ajvInstance;
};

export const getResponseValidator = async (
  pathName: string,
  method: HttpMethod,
  statusCode: string
): Promise<ValidateFunction> => {
  const cacheKey = `${method}:${pathName}:${statusCode}`;
  const cached = validatorCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const doc = await loadOpenApi();
  const pathItem = doc.paths?.[pathName];
  if (!pathItem) {
    throw new Error(`OpenAPI specification missing path ${pathName}`);
  }

  const operation = pathItem[method];
  if (!operation) {
    throw new Error(`OpenAPI specification missing method ${method.toUpperCase()} for ${pathName}`);
  }

  const response =
    operation.responses?.[statusCode] ??
    operation.responses?.[Number(statusCode).toString()] ??
    operation.responses?.default;

  if (!response?.content?.['application/json']?.schema) {
    throw new Error(`OpenAPI specification missing schema for ${method.toUpperCase()} ${pathName} ${statusCode}`);
  }

  const schema = response.content['application/json'].schema;
  const overrideKey = `${method}:${pathName}:${statusCode}`;
  const transformedSchema = schemaOverrides[overrideKey]?.(schema) ?? schema;
  const ajv = getAjv();
  const validator = ajv.compile(transformedSchema);
  validatorCache.set(cacheKey, validator);
  return validator;
};
