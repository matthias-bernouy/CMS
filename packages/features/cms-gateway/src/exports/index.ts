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
    ComputedParamRef, ParamValueSource,
} from "../interfaces/Gateway";
export { COMPUTED_PARAM_REFS, HTTP_METHODS, PARAM_INS } from "../interfaces/Gateway";
export type { DataShape } from "../interfaces/DataShape";
export {
    FORBIDDEN_REQUEST_HEADERS, HEADER_NAME_RE, isForbiddenHeaderName, isValidHeaderName,
    isValidHeaderValue, MAX_ENDPOINT_HEADERS, MAX_HEADER_VALUE_LENGTH,
} from "../core/headerPolicy";

export type { GatewayRepository } from "../interfaces/GatewayRepository";
export { InMemoryGatewayRepository } from "../default-implementation/InMemoryGatewayRepository";
export { ValidatingGatewayRepository } from "../core/ValidatingGatewayRepository";

// ── Core (pure logic) ──
export {
    parseUrn, makeProviderUrn, makeEndpointUrn, providerUrnOf, isProviderUrn, isEndpointUrn,
    type ParsedUrn,
} from "../core/urn";
export { validateProvider, endpointBelongsToProvider, isParsableUrl, isValidResponseStatus } from "../core/validateProvider";
export { GatewayValidationError, DuplicateProviderError } from "../core/errors";
export { parseDataShape } from "../core/parseDataShape";
export {
    providerDtoToProvider,
    providerToDto,
    providerToFlatDto,
    providerToCanonicalDto,
    type ProviderDto,
    type EndpointDto,
    type ProviderParamDto,
    type ProviderFlatDto,
    type CanonicalEndpointDto,
    type CanonicalProviderDto,
} from "../core/providerDto";
export { resolveEndpoint, type ResolveResult } from "../core/resolveEndpoint";
export { seedProviders, type SeedResult } from "../core/seedProviders";
export {
    buildUpstreamUrl,
    extractPathParamNames,
    type BuildUpstream,
    type GatewayComputedContext,
} from "../core/buildUpstreamUrl";
export { executeEndpoint, type ExecutorDeps, type GatewaySecretResolver } from "../core/executeEndpoint";
export { CMS_GATEWAY_ROUTE, GATEWAY_PROXY_METHODS, gatewayPrefix, handleGatewayRequest } from "../http/handleGatewayRequest";

// ── OpenAPI spec machinery (provider endpoint schemas) ────────────────
export { parseSpec }      from "../core/openapi/parseSpec";
export { SpecResolver }   from "../core/openapi/SpecResolver";
export { SpecParseError } from "../core/openapi/SpecParseError";
export { openApiSpecToProvider, type OpenApiImportOperation, type OpenApiProviderImportOptions } from "../core/openapi/provider";
export { stubFromSchema } from "../core/openapi/stubFromSchema";
export { resolveRef }     from "../core/openapi/resolveRef";
export { deref }          from "../core/openapi/deref";
export { flattenSchema }  from "../core/openapi/flattenSchema";
export { swagger2to3 }    from "../core/openapi/swagger2to3";
export type { ParsedSpec, JSONSchema, PathItem, Operation, Parameter } from "../core/openapi/types";
