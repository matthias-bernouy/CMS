import "./provider.fixture";
import { contractString, defineContract, defineOperation, z } from "@bernouy/ulvia-sdk";
import type { OperationHandler, OperationInput, OperationOutput } from "@bernouy/ulvia-sdk";
import { notesContract, readNote } from "../../examples/notes";

const input: OperationInput<typeof readNote> = { id: "one" };
const output: OperationOutput<typeof readNote> = { id: input.id, text: "One" };
const handler: OperationHandler<typeof readNote, { prefix: string }> = (value, context) => ({
    id: value.id,
    text: context.prefix,
});
void handler(input, { prefix: output.text });

// @ts-expect-error The inferred input requires a string identifier.
const invalidInput: OperationInput<typeof readNote> = { id: 1 };
// @ts-expect-error Output types come from the operation schema.
const invalidOutput: OperationOutput<typeof readNote> = { id: "one" };
// @ts-expect-error Handlers must implement the operation's result type.
const invalidHandler: OperationHandler<typeof readNote> = () => ({ text: "Missing id" });

const booleanOperation = defineOperation({
    input: z.strictObject({ flag: z.boolean() }),
    output: z.boolean(),
    errors: {},
    // @ts-expect-error A mock cannot change the schema inferred from the declaration.
    mocks: [{ id: "invalid", input: { flag: "yes" }, outcome: { kind: "success", output: true } }],
});
const errorOperation = defineOperation({
    input: z.strictObject({}),
    output: z.boolean(),
    errors: { NOT_FOUND: { retryable: false, output: z.strictObject({ message: contractString({ maxLength: 20 }) }) } },
    // @ts-expect-error Error mock outputs follow the error-specific schema.
    mocks: [{ id: "invalid-error", input: {}, outcome: { kind: "error", code: "NOT_FOUND", output: { message: 1 } } }],
});
const unknownError = defineOperation({
    input: z.strictObject({}),
    output: z.boolean(),
    errors: { NOT_FOUND: { retryable: false } },
    // @ts-expect-error Mock error codes must be declared by the operation.
    mocks: [{ id: "unknown-error", input: {}, outcome: { kind: "error", code: "UNKNOWN" } }],
});

defineContract({
    ...notesContract,
    capabilities: {
        "notes.read": {
            ...notesContract.capabilities["notes.read"],
            // @ts-expect-error Every command must declare its idempotency behavior.
            behavior: { effect: "command", execution: "sync", sensitive: false },
        },
    },
});
void [invalidInput, invalidOutput, invalidHandler, booleanOperation, errorOperation, unknownError];
