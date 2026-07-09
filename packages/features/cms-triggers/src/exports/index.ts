/**
 * @bernouy/cms-triggers — declarative endpoint side effects. Triggers listen
 * to source endpoint proxy executions and call CMS functions without mutating
 * the original request or response.
 */
export type {
    TriggerDefinition,
    TriggerDto,
    TriggerEndpointEvent,
    TriggerEventPhase,
    TriggerFailureMode,
    TriggerFunctionCall,
    TriggerLastRun,
    TriggerMode,
    TriggerRecord,
    TriggerValue,
} from "../interfaces/TriggerDefinition";
export type { TriggerRepository } from "../interfaces/TriggerRepository";
export { InMemoryTriggerRepository } from "../default-implementation/InMemoryTriggerRepository";
export { DuplicateTriggerError } from "../core/errors";
export {
    endpointMatch,
    matchesTriggerEndpoint,
    matchingTriggers,
    type TriggerEndpointMatch,
} from "../core/matchTrigger";
export {
    anyTriggerReadsRequestBody,
    anyTriggerReadsResponseBody,
    resolveTriggerReference,
    triggerReadsRequestBody,
    triggerReadsResponseBody,
    triggerReferences,
    triggerVars,
    type TriggerRuntimeVars,
} from "../core/triggerRefs";
export {
    DEFAULT_TRIGGER_BODY_LIMIT_BYTES,
    readJsonBodyUnderLimit,
} from "../core/bodyBuffer";
export {
    effectiveFailureMode,
    runTriggers,
    type RunTriggersOptions,
    type RunTriggersResult,
} from "../core/runTriggers";
export {
    createTriggerInterceptor,
    type CreateTriggerInterceptorOptions,
    type TriggerInterceptor,
} from "../core/createTriggerInterceptor";
export { validateTrigger } from "../core/validateTrigger";
