export type {
    Source,
    SourceEndpoint,
    HTTPMethod,
    ParamIn,
    EndpointHeader,
    HeaderSource,
    EndpointParam,
    SourceMeta,
    EndpointResponse,
    ComputedParamRef,
    ParamValueSource,
    ResponseKind,
    SourceEndpointAccess,
    SourceEndpointAccessMode,
    SourceEndpointEffects,
    SourceMediaRequestBinding,
    SourceMediaResponseBinding,
    SourceMediaInventoryEffect,
    SourceProducedMediaEffect,
    SourceRemovedMediaEffect,
} from "./interfaces/Source";
export type {
    SourceFieldPath,
    SourceIndexing,
    SourceIndexingCursorPagination,
    SourceIndexingEntity,
    SourceIndexingIdentity,
    SourceIndexingOffsetPagination,
    SourceIndexingPagination,
    SourceIndexingVariable,
    SourceIndexingVariableType,
} from "./interfaces/SourceIndexing";
export {
    COMPUTED_PARAM_REFS,
    DEFAULT_SOURCE_ENDPOINT_TIMEOUT_MS,
    HTTP_METHODS,
    MAX_SOURCE_ENDPOINT_TIMEOUT_MS,
    PARAM_INS,
    RESPONSE_KINDS,
    SOURCE_ENDPOINT_ACCESS_MODES,
    SOURCE_MEDIA_EFFECT_VERSION,
} from "./interfaces/Source";
export {
    MAX_SOURCE_INDEXING_PAGE_SIZE,
    SOURCE_INDEXING_VARIABLE_NAMESPACE,
    SOURCE_INDEXING_VARIABLE_TYPES,
} from "./interfaces/SourceIndexing";
export {
    projectResolvedIndexingEntity,
    type ProjectedIndexingEntity,
} from "./core/model/projectResolvedIndexingEntity";
export {
    projectIndexingDiscoveryPage,
    type ProjectedIndexingDiscoveryItem,
    type ProjectedIndexingDiscoveryPage,
} from "./core/model/projectIndexingDiscoveryPage";
export {
    SOURCE_TIMING_STAGES,
    UNRESOLVED_SOURCE_ENDPOINT,
    type SourceDiagnosticCohort,
    type SourceDiagnosticReporter,
    type SourceExecutionObservability,
    type SourceRequestDiagnostic,
    type SourceRequestObservation,
    type SourceRequestObserver,
    type SourceRequestOutcome,
    type SourceRequestTelemetryOptions,
    type SourceTimingStage,
} from "./interfaces/SourceObservability";
export type { DataShape } from "./interfaces/DataShape";
export {
    FORBIDDEN_REQUEST_HEADERS,
    HEADER_NAME_RE,
    isForbiddenHeaderName,
    isValidHeaderName,
    isValidHeaderValue,
    MAX_ENDPOINT_HEADERS,
    MAX_HEADER_VALUE_LENGTH,
} from "./core/upstream/headerPolicy";
export { isReservedSourceParamName } from "./core/validation/sourceRequestValidation";
export type { SourceRepository, SourceSchemaInvalidationScope } from "./interfaces/SourceRepository";
export type {
    SourceOverlay,
    SourceOverlayDashboardDataRef,
    SourceOverlayDashboardEndpointRef,
    SourceOverlayDashboardField,
    SourceOverlayDashboardFieldPatch,
    SourceOverlayDashboardFieldType,
    SourceOverlayDashboardLookupRef,
    SourceOverlayDashboardOption,
    SourceOverlayEditableScope,
    SourceOverlayEndpointTarget,
    SourceOverlayField,
    SourceOverlayFieldSource,
    SourceOverlayFieldSourceMap,
    SourceOverlayFieldType,
    SourceOverlayRepository,
    SourceOverlaySection,
} from "./interfaces/SourceOverlay";
export {
    SOURCE_OVERLAY_DASHBOARD_FIELD_TYPES,
    SOURCE_OVERLAY_EDITABLE_SCOPES,
    SOURCE_OVERLAY_FIELD_TYPES,
    sourceOverlayFieldShape,
} from "./interfaces/SourceOverlay";
export { InMemorySourceRepository } from "./default-implementation/InMemorySourceRepository";
export { InMemorySourceOverlayRepository } from "./default-implementation/InMemorySourceOverlayRepository";
export { ValidatingSourceRepository } from "./core/repositories/ValidatingSourceRepository";
export { CompositeSourceRepository } from "./core/repositories/CompositeSourceRepository";
export { readPersistedSource } from "./core/repositories/persistedSource";
