"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getResponseValidator = void 0;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const ajv_1 = __importDefault(require("ajv"));
const ajv_formats_1 = __importDefault(require("ajv-formats"));
const json_schema_ref_parser_1 = require("@apidevtools/json-schema-ref-parser");
const yaml_1 = require("yaml");
const backendDir = node_path_1.default.resolve(__dirname, '../../..');
const repoRoot = node_path_1.default.resolve(backendDir, '..');
const openapiCandidatePaths = [
    node_path_1.default.join(repoRoot, 'platform/ARTIFACTS/openapi.yaml'),
    node_path_1.default.join(repoRoot, 'backend/contract/openapi.yaml'),
    node_path_1.default.join(backendDir, 'contract/openapi.yaml')
];
const openapiPath = openapiCandidatePaths.find((candidate) => node_fs_1.default.existsSync(candidate));
if (!openapiPath) {
    throw new Error(`OpenAPI specification is missing. Provide one of: ${openapiCandidatePaths
        .map((candidate) => node_path_1.default.relative(process.cwd(), candidate))
        .join(', ')}`);
}
let cachedOpenApiPromise = null;
let ajvInstance = null;
const validatorCache = new Map();
const schemaOverrides = {
    'get:/dashboard/summary:200': (schema) => {
        const clone = JSON.parse(JSON.stringify(schema));
        const properties = clone.properties;
        if (!properties) {
            return clone;
        }
        const extendNullable = (definition) => {
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
const loadOpenApi = async () => {
    if (!cachedOpenApiPromise) {
        cachedOpenApiPromise = (async () => {
            const raw = await node_fs_1.default.promises.readFile(openapiPath, 'utf8');
            const parsed = (0, yaml_1.parse)(raw);
            const dereferenced = (await (0, json_schema_ref_parser_1.dereference)(parsed));
            return dereferenced;
        })();
    }
    return cachedOpenApiPromise;
};
const getAjv = () => {
    if (!ajvInstance) {
        ajvInstance = new ajv_1.default({
            strict: false,
            allErrors: true,
            allowUnionTypes: true
        });
        (0, ajv_formats_1.default)(ajvInstance);
    }
    return ajvInstance;
};
const getResponseValidator = async (pathName, method, statusCode) => {
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
    const response = operation.responses?.[statusCode] ??
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
exports.getResponseValidator = getResponseValidator;
