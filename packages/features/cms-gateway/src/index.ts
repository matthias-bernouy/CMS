/**
 * @bernouy/cms-gateway — data-gateway substrate. Declares providers and their
 * endpoints (call contract + input/output DataShapes + injected request headers),
 * persists them, and resolves incoming requests to a declared endpoint.
 * CMS- and persistence-agnostic; consumed by cms-delivery (proxy) and the
 * cms-control editor.
 */
export type {
    Provider, Endpoint, HTTPMethod, ParamIn,
    EndpointHeader, HeaderSource, EndpointParam, GatewayMeta, EndpointResponse,
} from "./interfaces/Gateway";
export { HTTP_METHODS, PARAM_INS } from "./interfaces/Gateway";
export type { DataShape } from "./interfaces/DataShape";
export {
    FORBIDDEN_REQUEST_HEADERS, HEADER_NAME_RE, isForbiddenHeaderName, isValidHeaderName,
    isValidHeaderValue, MAX_ENDPOINT_HEADERS, MAX_HEADER_VALUE_LENGTH,
} from "./core/headerPolicy";

export type { GatewayRepository } from "./interfaces/GatewayRepository";
export { InMemoryGatewayRepository } from "./default-implementation/GatewayRepository/memory";
export { MongoGatewayRepository, type MongoGatewayRepositoryConfig } from "./default-implementation/GatewayRepository/mongodb";
export { ValidatingGatewayRepository } from "./core/ValidatingGatewayRepository";

// ── Core (pure logic) ──
export {
    parseUrn, makeProviderUrn, makeEndpointUrn, providerUrnOf, isProviderUrn, isEndpointUrn,
    type ParsedUrn,
} from "./core/urn";
export { validateProvider, endpointBelongsToProvider, isParsableUrl, isValidResponseStatus } from "./core/validateProvider";
export { GatewayValidationError } from "./core/errors";
export { parseDataShape } from "./core/parseDataShape";
export { resolveEndpoint, type ResolveResult } from "./core/resolveEndpoint";
export { seedProviders, type SeedResult } from "./core/seedProviders";
export { buildUpstreamUrl, extractPathParamNames, type BuildUpstream } from "./core/buildUpstreamUrl";
export { executeEndpoint, type ExecutorDeps } from "./core/executeEndpoint";
export { handleGatewayRequest } from "./http/handleGatewayRequest";
export { registerGatewayEndpoint } from "./http/registerGatewayEndpoint";

// ── OpenAPI spec machinery (provider endpoint schemas) ────────────────
export { parseSpec }      from "./core/openapi/parseSpec";
export { SpecResolver }   from "./core/openapi/SpecResolver";
export { SpecParseError } from "./core/openapi/SpecParseError";
export { stubFromSchema } from "./core/openapi/stubFromSchema";
export { resolveRef }     from "./core/openapi/resolveRef";
export { deref }          from "./core/openapi/deref";
export { flattenSchema }  from "./core/openapi/flattenSchema";
export { swagger2to3 }    from "./core/openapi/swagger2to3";
export type { ParsedSpec, JSONSchema, PathItem, Operation, Parameter } from "./core/openapi/types";
