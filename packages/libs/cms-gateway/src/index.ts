/**
 * @bernouy/cms-gateway — data-gateway substrate. Declares providers and their
 * endpoints (call contract + input/output DataShapes + injected request headers),
 * persists them, and resolves incoming requests to a declared endpoint.
 * CMS- and persistence-agnostic; consumed by cms-delivery (proxy) and the
 * cms-control editor.
 */
export type {
    Provider, Endpoint, HTTPMethod,
    EndpointHeader, HeaderSource, EndpointParam, GatewayMeta, EndpointResponse,
} from "./interfaces/Gateway";
export { HTTP_METHODS } from "./interfaces/Gateway";
export type { DataShape } from "./interfaces/DataShape";
export {
    FORBIDDEN_REQUEST_HEADERS, HEADER_NAME_RE, isForbiddenHeaderName, isValidHeaderName,
} from "./core/headerPolicy";

export type { GatewayRepository } from "./interfaces/GatewayRepository";
export { InMemoryGatewayRepository } from "./default-implementation/GatewayRepository/memory";
export { MongoGatewayRepository, type MongoGatewayRepositoryConfig } from "./default-implementation/GatewayRepository/mongodb";

// ── Core (pure logic) ──
export {
    parseUrn, makeProviderUrn, makeEndpointUrn, providerUrnOf, isProviderUrn, isEndpointUrn,
    type ParsedUrn,
} from "./core/urn";
export { validateProvider, endpointBelongsToProvider } from "./core/validateProvider";
export { resolveEndpoint, type ResolveResult } from "./core/resolveEndpoint";
export { seedProviders, type SeedResult } from "./core/seedProviders";
export { buildUpstreamUrl, type BuildUpstream } from "./core/buildUpstreamUrl";
export { executeEndpoint, type ExecutorDeps } from "./core/executeEndpoint";
export { handleGatewayRequest } from "./core/handleGatewayRequest";
export { registerGatewayEndpoint } from "./core/registerGatewayEndpoint";
