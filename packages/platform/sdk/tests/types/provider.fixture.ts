import {
    contractBinary,
    defineContract,
    defineOperation,
    implementContract,
    operationError,
    z,
} from "@bernouy/ulvia-sdk";
import { compileProvider } from "@bernouy/ulvia-sdk/build";
import { createProvider } from "@bernouy/ulvia-sdk/provider";
import { notesContract, readNote } from "../../examples/notes";
import { notesProviderDefinition } from "../../examples/provider";

// @ts-expect-error Every effective capability requires a handler factory.
implementContract(notesContract, {});
implementContract(notesContract, {
    // @ts-expect-error The operation's result schema determines the handler output.
    "notes.read": (_dependencies: {}) => (input) => ({ id: input.id, text: 42 }),
});
implementContract(notesContract, {
    // @ts-expect-error A handler cannot substitute an incompatible input schema.
    "notes.read": (_dependencies: {}) => (input: { id: number }) => ({ id: String(input.id), text: "Wrong" }),
});

operationError(readNote, "NOT_FOUND", { message: "Missing" });
// @ts-expect-error Error codes come from this operation's declaration.
operationError(readNote, "UNKNOWN", { message: "Missing" });
// @ts-expect-error The declared error requires its typed payload.
operationError(readNote, "NOT_FOUND");
// @ts-expect-error The declared error payload has a string message.
operationError(readNote, "NOT_FOUND", { message: 42 });

const upload = defineContract({
    contractId: "example/upload",
    name: "Upload",
    publisherId: "example",
    version: "1.0.0",
    capabilities: {
        upload: {
            operation: defineOperation({
                input: z.strictObject({ payload: contractBinary({ maxBytes: 4 }) }),
                output: z.null(),
                errors: {},
            }),
            access: "admin",
            behavior: { effect: "command", execution: "sync", sensitive: true, idempotency: "natural" },
            bindings: [],
        },
    },
});
implementContract(upload, {
    upload: (_dependencies: {}) => (input, context) => {
        void context.binaryBody.stream;
        // @ts-expect-error Streamed bytes are supplied in context, not a fabricated Uint8Array in JSON input.
        void input.payload;
        return null;
    },
});

const child = defineContract({
    ...notesContract,
    contractId: "example/special",
    extends: notesContract,
    capabilities: {
        status: {
            operation: defineOperation({ input: z.strictObject({}), output: z.boolean(), errors: {} }),
            access: "public",
            behavior: { effect: "query", execution: "sync", sensitive: false },
            bindings: [],
        },
    },
});
// @ts-expect-error Specialized contracts also require their inherited handlers.
implementContract(child, { status: (_dependencies: {}) => () => true });
implementContract(child, {
    "notes.read": (_dependencies: {}) => (input) => ({ id: input.id, text: "Inherited" }),
    status: (_dependencies: {}) => () => true,
});

async function runtimeDependencyTypes(): Promise<void> {
    const build = await compileProvider(notesProviderDefinition("http://127.0.0.1:5103"));
    createProvider(
        build,
        // @ts-expect-error Compiled Provider dependencies remain typed at runtime construction.
        {},
        {
            scope: { siteId: "site", instanceId: "instance" },
            authenticate: async () => null,
            authorize: async () => true,
        },
    );
}
void runtimeDependencyTypes;
