import type { z } from "zod";
import type { OperationSource } from "ulvia-sdk/interfaces/operations";

export class OperationFailure extends Error {
    constructor(
        readonly operation: OperationSource,
        readonly code: string,
        readonly output?: unknown,
    ) {
        super(code);
        this.name = "OperationFailure";
    }
}

type FailureArguments<
    Operation extends OperationSource,
    Code extends keyof Operation["errors"],
> = Operation["errors"][Code] extends { readonly output: infer Schema extends z.ZodType }
    ? [output: z.input<Schema>]
    : [];

/** Business errors carry their declared code and payload; the transport chooses the HTTP status. */
export function operationError<Operation extends OperationSource, Code extends keyof Operation["errors"] & string>(
    operation: Operation,
    code: Code,
    ...args: FailureArguments<NoInfer<Operation>, NoInfer<Code>>
): OperationFailure {
    if (!Object.hasOwn(operation.errors, code)) {
        throw new TypeError(`Undeclared operation error: ${code}`);
    }
    const schema = operation.errors[code]!.output;
    if (!schema && args.length) {
        throw new TypeError("This operation error has no payload");
    }
    const output = schema ? schema.parse(args[0]) : undefined;
    return new OperationFailure(operation, code, output === undefined ? undefined : structuredClone(output));
}

export function isOperationFailure(value: unknown): value is OperationFailure {
    return value instanceof OperationFailure;
}
