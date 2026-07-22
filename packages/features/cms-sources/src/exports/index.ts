/**
 * @bernouy/cms-sources — data-source substrate. Declares sources and their
 * endpoints (call contract + input/output DataShapes + injected request headers),
 * persists them, and resolves incoming requests to a declared endpoint.
 * CMS- and persistence-agnostic; consumed by cms-delivery (proxy) and the
 * cms-control editor.
 */
export * from "../publicApi";

// ── Core (pure logic) ──
export {
    parseUrn,
    makeSourceUrn,
    makeEndpointUrn,
    sourceUrnOf,
    isSourceUrn,
    isEndpointUrn,
    type ParsedUrn,
} from "../core/system/urn";
export {
    validateSource,
    endpointBelongsToSource,
    isParsableUrl,
    validateSourceTargetUrl,
    isAllowedSourceTargetUrl,
    isValidResponseStatus,
    type SourceTargetUrlValidationOptions,
} from "../core/validation/validateSource";
export {
    SYSTEM_SOURCE_ID_PREFIX,
    SYSTEM_AUTH_SOURCE_ID,
    SYSTEM_AUTH_SOURCE_URN,
    SYSTEM_AUTH_SOURCE,
    SYSTEM_SOURCES,
    isSystemSourceId,
    isSystemSourceUrn,
    systemSourceUrnOf,
} from "../core/system/systemSources";
export { SourceValidationError, DuplicateSourceError } from "../core/model/errors";
export {
    DEFAULT_SOURCE_ENDPOINT_ACCESS_MODE,
    isSourceEndpointAccessMode,
    sourceEndpointAccessAllows,
    sourceEndpointAccessMode,
} from "../core/execution/access";
export {
    dataShapeAtPath,
    dataValueAtPath,
    parseDataShape,
    type DataShapePathOptions,
} from "../core/validation/parseDataShape";
export {
    DataShapeProjectionError,
    projectStrictDataShape,
    type StrictDataShapeProjectionOptions,
} from "../core/model/projectStrictDataShape";
export {
    safeUpstreamFailureResponse,
    type SafeUpstreamFailureResponseOptions,
    type UndeclaredUpstreamStatus,
} from "../core/upstream/upstreamFailure";
export {
    SourceOverlaySourceRepository,
    applySourceOverlays,
    materializeSourceOverlays,
    sourceOverlaySchemaCacheFor,
    sourceOverlayFieldPath,
    type SourceOverlaySourceRepositoryOptions,
} from "../core/overlays/sourceOverlay";
export {
    DEFAULT_SOURCE_OVERLAY_SCHEMA_CACHE_TTL_MS,
    SourceOverlaySchemaCache,
    type SourceOverlaySchemaCacheOptions,
    type SourceOverlaySchemaCacheSelector,
} from "../core/repositories/SourceOverlaySchemaCache";
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
} from "../core/overlays/sourceDto";
export { resolveEndpoint, type ResolveResult } from "../core/execution/resolveEndpoint";
export { seedSources, type SeedResult } from "../core/system/seedSources";
export {
    buildUpstreamUrl,
    extractPathParamNames,
    type BuildUpstream,
    type SourceComputedContext,
} from "../core/upstream/buildUpstreamUrl";
export { executeEndpoint, type ExecutorDeps, type SourceSecretResolver } from "../core/execution/executeEndpoint";
export {
    MAX_PROJECTED_JSON_BYTES,
    RESPONSE_PROJECTION_MODES,
    projectEndpointResponse,
    type LegacyResponseContractReason,
    type ResponseProjectionEvent,
    type ResponseProjectionFailureReason,
    type ResponseProjectionMode,
    type ResponseProjectionOptions,
    type ResponseProjectionReporter,
} from "../core/response-projection/projectEndpointResponse";
export {
    projectDataShape,
    type DataShapeProjectionResult,
} from "../core/response-projection/projectDataShape";
export {
    triggerResponseProjection,
    type TriggerResponseProjection,
} from "../core/response-projection/triggerResponseBody";
export {
    CMS_SOURCES_ROUTE,
    SOURCE_PROXY_METHODS,
    sourcesPrefix,
    handleSourceRequest,
    isSourceAuthorized,
    sourceAuthorizationBody,
    sourceAuthorizationStatus,
    type SourceHandlerDeps,
    type SourceSystemExecutor,
    type SourceEndpointInterceptor,
    type SourceAuthorizationResult,
    type SourceEndpointAuthorizer,
} from "../http/handleSourceRequest";
