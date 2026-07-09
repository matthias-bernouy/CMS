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
export { DuplicateFunctionError, FunctionExecutionError } from "../core/errors";
export {
    SYSTEM_FUNCTIONS_SOURCE_ID,
    SYSTEM_FUNCTIONS_SOURCE_URN,
    SYSTEM_FUNCTIONS_TARGET_SCHEME,
    functionAsEndpoint,
    functionsAsSource,
} from "../core/projection";
export { FunctionSourceRepository, functionEndpointUrn } from "../core/FunctionSourceRepository";
export { FunctionAwareSourceRepository, withFunctionsSource } from "../core/FunctionAwareSourceRepository";
export {
    validateFunction,
    type ValidateFunctionOptions,
} from "../core/validateFunction";
export {
    executeFunction,
    type ExecuteFunctionOptions,
    type FunctionUserContext,
} from "../core/executeFunction";
export {
    executeFunctionSystemSourceEndpoint,
    type FunctionSystemExecutorOptions,
} from "../core/systemExecutor";
export {
    collectReferences,
    resolveFunctionValue,
    resolveReference,
    valueAt,
    type FunctionRuntimeVars,
    type ReferenceResolver,
} from "../core/expressions";
export { evaluateCondition } from "../core/conditions";
