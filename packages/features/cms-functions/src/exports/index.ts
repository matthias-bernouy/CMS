/**
 * @bernouy/cms-functions — declarative workflows projected as system source
 * endpoints. Functions compose declared source endpoints with bounded
 * conditions and server-side execution.
 */
export type {
    CmsFunction,
    FunctionAssert,
    FunctionCall,
    FunctionCondition,
    FunctionDefinition,
    FunctionDto,
    FunctionExecuteField,
    FunctionExecuteUi,
    FunctionEndpointInput,
    FunctionExpression,
    FunctionForEach,
    FunctionReturn,
    FunctionStep,
    FunctionUi,
    FunctionValue,
} from "../interfaces/FunctionDefinition";
export type { FunctionRepository } from "../interfaces/FunctionRepository";
export { InMemoryFunctionRepository } from "../default-implementation/InMemoryFunctionRepository";
export { DuplicateFunctionError, FunctionExecutionError } from "../core/model/errors";
export {
    SYSTEM_FUNCTIONS_SOURCE_ID,
    SYSTEM_FUNCTIONS_SOURCE_URN,
    SYSTEM_FUNCTIONS_TARGET_SCHEME,
    functionAsEndpoint,
    functionsAsSource,
} from "../core/repositories/projection";
export { FunctionSourceRepository, functionEndpointUrn } from "../core/repositories/FunctionSourceRepository";
export { FunctionAwareSourceRepository, withFunctionsSource } from "../core/repositories/FunctionAwareSourceRepository";
export {
    validateFunction,
    type ValidateFunctionOptions,
} from "../core/validation/validateFunction";
export {
    executeFunction,
    type FunctionExecutionFailure,
    type FunctionFailureReporter,
    type ExecuteFunctionOptions,
    type FunctionUserContext,
} from "../core/execution/executeFunction";
export {
    executeFunctionSystemSourceEndpoint,
    type FunctionSystemExecutorOptions,
} from "../core/execution/systemExecutor";
export {
    runScheduledSystemFunctionOnce,
    startScheduledSystemFunctions,
    type ScheduledFunctionLogger,
    type ScheduledFunctionRunContext,
    type ScheduledFunctionRunResult,
    type ScheduledFunctionTimer,
    type ScheduledSystemFunctionJob,
    type ScheduledSystemFunctionRunner,
    type ScheduledSystemFunctionRunnerOptions,
} from "../core/scheduled";
export {
    collectReferences,
    resolveFunctionValue,
    resolveReference,
    valueAt,
    type FunctionRuntimeVars,
    type ReferenceResolver,
} from "../core/model/expressions";
export { evaluateCondition } from "../core/model/conditions";
