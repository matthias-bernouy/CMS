import "./error-policy.fixture";
import "./guards.fixture";
import "./execution.fixture";
import "./capabilities.fixture";
import "./provider.fixture";
import { contractString, defineFeature, defineCapability, z } from "@bernouy/ulvia-sdk";
import type { CapabilityHandler, CapabilityInput, CapabilityOutput } from "@bernouy/ulvia-sdk";
import { notesFeature, readNote } from "../../examples/notes";
const input: CapabilityInput<typeof readNote> = { id: "one" };
const output: CapabilityOutput<typeof readNote> = { id: input.id, text: "One" };
const handler: CapabilityHandler<
    typeof readNote,
    {
        prefix: string;
    }
> = (value, context) => ({
    id: value.id,
    text: context.prefix,
});
void handler(input, { prefix: output.text });
// @ts-expect-error The inferred input requires a string identifier.
const invalidInput: CapabilityInput<typeof readNote> = { id: 1 };
// @ts-expect-error Output types come from the operation schema.
const invalidOutput: CapabilityOutput<typeof readNote> = { id: "one" };
// @ts-expect-error Handlers must implement the operation's result type.
const invalidHandler: CapabilityHandler<typeof readNote> = () => ({ text: "Missing id" });
const booleanOperation = defineCapability({
    id: "test.capability",
    access: "public",
    behavior: { effect: "query", execution: "sync", sensitive: false },
    bindings: [{ id: "mcp", transport: "mcp" }],
    input: z.strictObject({ flag: z.boolean() }),
    output: z.boolean(),
    errors: {},
    // @ts-expect-error A mock cannot change the schema inferred from the declaration.
    mocks: [{ id: "invalid", input: { flag: "yes" }, outcome: { kind: "success", output: true } }],
});
const errorOperation = defineCapability({
    id: "test.capability",
    access: "public",
    behavior: { effect: "query", execution: "sync", sensitive: false },
    bindings: [{ id: "mcp", transport: "mcp" }],
    input: z.strictObject({}),
    output: z.boolean(),
    errors: { NOT_FOUND: { retryable: false, output: z.strictObject({ message: contractString({ maxLength: 20 }) }) } },
    // @ts-expect-error Error mock outputs follow the error-specific schema.
    mocks: [{ id: "invalid-error", input: {}, outcome: { kind: "error", code: "NOT_FOUND", output: { message: 1 } } }],
});
const unknownError = defineCapability({
    id: "test.capability",
    access: "public",
    behavior: { effect: "query", execution: "sync", sensitive: false },
    bindings: [{ id: "mcp", transport: "mcp" }],
    input: z.strictObject({}),
    output: z.boolean(),
    errors: { NOT_FOUND: { retryable: false } },
    // @ts-expect-error Mock error codes must be declared by the operation.
    mocks: [{ id: "unknown-error", input: {}, outcome: { kind: "error", code: "UNKNOWN" } }],
});
defineFeature({
    ...notesFeature,
    capabilities: [
        {
            ...notesFeature.capabilities[0],
            // @ts-expect-error Every command must declare its idempotency behavior.
            behavior: { effect: "command", execution: "sync", sensitive: false },
            id: "notes.read",
        },
    ],
});
void [invalidInput, invalidOutput, invalidHandler, booleanOperation, errorOperation, unknownError];
