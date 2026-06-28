/**
 * @bernouy/cms-sources — data-source substrate. Declares sources and their
 * endpoints (call contract + input/output DataShapes + injected request headers),
 * persists them, and resolves incoming requests to a declared endpoint.
 * CMS- and persistence-agnostic; consumed by cms-delivery (proxy) and the
 * cms-control editor.
 */
export type {
    Source, SourceEndpoint, HTTPMethod, ParamIn,
    EndpointHeader, HeaderSource, EndpointParam, SourceMeta, EndpointResponse,
    ComputedParamRef, ParamValueSource,
} from "../interfaces/Source";
export { COMPUTED_PARAM_REFS, HTTP_METHODS, PARAM_INS } from "../interfaces/Source";
export type { DataShape } from "../interfaces/DataShape";
export {
    FORBIDDEN_REQUEST_HEADERS, HEADER_NAME_RE, isForbiddenHeaderName, isValidHeaderName,
    isValidHeaderValue, MAX_ENDPOINT_HEADERS, MAX_HEADER_VALUE_LENGTH,
} from "../core/headerPolicy";

export type { SourceRepository } from "../interfaces/SourceRepository";
export { InMemorySourceRepository } from "../default-implementation/InMemorySourceRepository";
export { ValidatingSourceRepository } from "../core/ValidatingSourceRepository";
export { CompositeSourceRepository } from "../core/CompositeSourceRepository";

// ── Core (pure logic) ──
export {
    parseUrn, makeSourceUrn, makeEndpointUrn, sourceUrnOf, isSourceUrn, isEndpointUrn,
    type ParsedUrn,
} from "../core/urn";
export {
    validateSource,
    endpointBelongsToSource,
    isParsableUrl,
    validateSourceTargetUrl,
    isAllowedSourceTargetUrl,
    isValidResponseStatus,
    type SourceTargetUrlValidationOptions,
} from "../core/validateSource";
export {
    SYSTEM_SOURCE_ID_PREFIX,
    SYSTEM_AUTH_SOURCE_ID,
    SYSTEM_AUTH_SOURCE_URN,
    SYSTEM_AUTH_SOURCE,
    SYSTEM_SOURCES,
    isSystemSourceId,
    isSystemSourceUrn,
    systemSourceUrnOf,
} from "../core/systemSources";
export { SourceValidationError, DuplicateSourceError } from "../core/errors";
export { parseDataShape } from "../core/parseDataShape";
export {
    sourceDtoToSource,
    sourceToDto,
    sourceToFlatDto,
    sourceToCanonicalDto,
    type SourceDto,
    type SourceEndpointDto,
    type SourceParamDto,
    type SourceFlatDto,
    type CanonicalSourceEndpointDto,
    type CanonicalSourceDto,
} from "../core/sourceDto";
export { resolveEndpoint, type ResolveResult } from "../core/resolveEndpoint";
export { seedSources, type SeedResult } from "../core/seedSources";
export {
    buildUpstreamUrl,
    extractPathParamNames,
    type BuildUpstream,
    type SourceComputedContext,
} from "../core/buildUpstreamUrl";
export { executeEndpoint, type ExecutorDeps, type SourceSecretResolver } from "../core/executeEndpoint";
export {
    CMS_SOURCES_ROUTE,
    SOURCE_PROXY_METHODS,
    sourcesPrefix,
    handleSourceRequest,
    type SourceHandlerDeps,
    type SourceSystemExecutor,
    type SourceEndpointAuthorizer,
} from "../http/handleSourceRequest";

// ── OpenAPI spec machinery (source endpoint schemas) ────────────────
export { parseSpec }      from "../core/openapi/parseSpec";
export { SpecResolver }   from "../core/openapi/SpecResolver";
export { SpecParseError } from "../core/openapi/SpecParseError";
export { openApiSpecToSource, type OpenApiImportOperation, type OpenApiSourceImportOptions } from "../core/openapi/source";
export { stubFromSchema } from "../core/openapi/stubFromSchema";
export { resolveRef }     from "../core/openapi/resolveRef";
export { deref }          from "../core/openapi/deref";
export { flattenSchema }  from "../core/openapi/flattenSchema";
export { swagger2to3 }    from "../core/openapi/swagger2to3";
export type { ParsedSpec, JSONSchema, PathItem, Operation, Parameter } from "../core/openapi/types";
