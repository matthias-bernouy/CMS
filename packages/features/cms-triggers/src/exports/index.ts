/**
 * @bernouy/cms-triggers — declarative endpoint side effects. Triggers listen
 * to source endpoint proxy executions and call CMS functions without mutating
 * the original request or response.
 */
export type {
    TriggerDefinition,
    TriggerDto,
    TriggerEndpointEvent,
    TriggerEvent,
    TriggerEventPhase,
    TriggerFailureMode,
    TriggerFunctionCall,
    TriggerLastRun,
    TriggerMode,
    TriggerRecord,
    TriggerScheduleEvent,
    TriggerScheduleRunning,
    TriggerScheduleState,
    TriggerTaskCall,
    TriggerValue,
} from "../interfaces/TriggerDefinition";
export type {
    ScheduledTriggerClaim,
    ScheduledTriggerClaimRequest,
    ScheduledTriggerCompletion,
    ScheduledTriggerTaskContext,
    ScheduledTriggerTaskHandler,
    ScheduledTriggerTaskRegistry,
} from "../interfaces/ScheduledTrigger";
export type { TriggerRepository } from "../interfaces/TriggerRepository";
export { InMemoryTriggerRepository } from "../default-implementation/InMemoryTriggerRepository";
export { DuplicateTriggerError } from "../core/errors";
export {
    endpointMatch,
    matchesEndpointTriggerScope,
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
export {
    claimTrigger,
    initializeSchedule,
    isDue,
    nextRunAt,
    type ScheduledClaimOwner,
} from "../core/runtime/scheduled/state";
export { startScheduledTriggers } from "../core/runtime/scheduled/runner";
export type {
    ScheduledTriggerLogger,
    ScheduledTriggerRunResult,
    ScheduledTriggerRunStatus,
    ScheduledTriggerRunner,
    ScheduledTriggerRunnerOptions,
    ScheduledTriggerTimer,
} from "../core/runtime/scheduled/types";
