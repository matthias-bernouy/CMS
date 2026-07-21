export class DuplicateFunctionError extends Error {
    constructor(readonly id: string) {
        super(`Function "${id}" already exists`);
    }
}

export class FunctionExecutionError extends Error {
    constructor(
        message: string,
        readonly status = 500,
        readonly details?: unknown,
        readonly correlationId?: string,
        readonly context: FunctionExecutionErrorContext = {},
    ) {
        super(message);
    }
}

export class RecoverableFunctionCallError extends FunctionExecutionError {}

export type FunctionExecutionErrorContext = {
    stepId?: string;
    source?: string;
    endpoint?: string;
    callStatus?: number;
};

export class UnexpectedFunctionExecutionError extends Error {
    constructor(
        readonly context: FunctionExecutionErrorContext,
        options?: ErrorOptions,
    ) {
        super("Unexpected function execution error", options);
    }
}

export function withFunctionExecutionErrorContext(
    error: FunctionExecutionError,
    context: FunctionExecutionErrorContext,
): FunctionExecutionError {
    return new FunctionExecutionError(error.message, error.status, error.details, error.correlationId, {
        ...context,
        ...error.context,
    });
}
