export class DuplicateFunctionError extends Error {
    constructor(readonly id: string) {
        super(`Function "${id}" already exists`);
    }
}

export class FunctionExecutionError extends Error {
    constructor(
        message: string,
        readonly status = 500,
    ) {
        super(message);
    }
}
