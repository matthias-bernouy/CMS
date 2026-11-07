import { defineFeature, defineCapability, implementContract, capabilityError, z } from "@bernouy/ulvia-sdk";
import type { ProviderCapabilityContext } from "@bernouy/ulvia-sdk";
import { notesFeature, readNote } from "../../examples/notes";

const { id: removedId, ...missingId } = readNote;
// @ts-expect-error Every operation declares its stable public identity.
defineCapability(missingId);
const { bindings: removedBindings, ...missingBindings } = readNote;
// @ts-expect-error Every operation declares its exposure list explicitly.
defineCapability(missingBindings);
// @ts-expect-error Access must be one of the admitted contract policies.
defineCapability({ ...readNote, access: "owner" });
// @ts-expect-error Unknown transport profiles cannot be silently emitted.
defineCapability({ ...readNote, bindings: [{ id: "ws", transport: "ws" }] });

const wrongMocks = [
    { id: "wrong", input: { id: 42 }, outcome: { kind: "success", output: { id: "one", text: "One" } } },
] as const;
// @ts-expect-error Imported mocks must not widen an operation's inferred input schema.
defineCapability({ ...readNote, mocks: wrongMocks });

const status = defineCapability({
    id: "notes.status",
    access: "public",
    behavior: { effect: "query", execution: "sync", sensitive: false },
    bindings: [],
    input: z.strictObject({ flag: z.boolean() }),
    output: z.boolean(),
    errors: {},
});
const feature = defineFeature({ ...notesFeature, capabilities: [readNote, status] });
implementContract(feature, {
    "notes.read": (_dependencies: {}) => (input) => ({ id: input.id, text: "One" }),
    "notes.status": (_dependencies: {}) => (input) => {
        // @ts-expect-error The status handler receives its own schema, not the note schema.
        void input.id;
        return input.flag;
    },
});
const literalId: "notes.read" = feature.capabilities[0].id;
const literalMethod: "GET" = feature.capabilities[0].bindings[0].method;
void [removedId, removedBindings, literalId, literalMethod];

capabilityError(readNote, "NOT_FOUND", { message: "Missing" }, { cause: new Error("Private") });
// @ts-expect-error ErrorOptions never replace an operation's required error payload.
capabilityError(readNote, "NOT_FOUND", { cause: new Error("Private") });

const optionalJson = defineCapability({
    ...readNote,
    input: z.strictObject({ name: z.string().optional() }),
    mocks: [],
});
const emptyJson = defineCapability({ ...readNote, input: z.strictObject({}), mocks: [] });
const jsonContext = { requestId: "request", contractVersion: "1.0.0", siteId: "site", providerId: "example/provider" };
const optionalContext: ProviderCapabilityContext<typeof optionalJson> = jsonContext;
const emptyContext: ProviderCapabilityContext<typeof emptyJson> = jsonContext;
// @ts-expect-error JSON capabilities never require a binary body lease.
void optionalContext.binaryBody.stream;
void emptyContext;
