import {
    capabilitiesFor,
    defineFeature,
    z,
    capabilityResponse,
    resourceResponse,
    contractBinary,
} from "@bernouy/ulvia-sdk";
import { executeCapability } from "@bernouy/ulvia-sdk/local";
const author = capabilitiesFor<{ notes: { read(): string } }>();
const read = author({
    id: "read",
    access: "public",
    behavior: { effect: "query", execution: "sync", sensitive: false },
    bindings: [],
    input: z.strictObject({}),
    output: z.string(),
    errors: {},
    execute: ({ services }) => services.notes.read(),
});
const feature = defineFeature({
    contractId: "example/error-types",
    name: "Errors",
    publisherId: "example",
    version: "1.0.0",
    capabilities: [read],
    mapError: () => undefined,
});
const context = { requestId: "r", contractVersion: "1.0.0", siteId: "site", providerId: "example/provider" };
const result: Promise<string> = executeCapability(feature, "read", {
    input: {},
    services: { notes: { read: () => "one" } },
    context,
});
void result;
// @ts-expect-error Unknown capability IDs cannot be locally executed.
executeCapability(feature, "missing", { input: {}, services: { notes: { read: () => "one" } }, context });
executeCapability(feature, "read", {
    input: {},
    // @ts-expect-error The feature overload retains the exact capability service port.
    services: { files: {} },
    context,
});
const declarative = defineFeature({
    contractId: "example/declarative-types",
    name: "Declared",
    publisherId: "example",
    version: "1.0.0",
    capabilities: [author({ ...read, execute: undefined })],
});
// @ts-expect-error Declarative capabilities have no default executor.
executeCapability(declarative, "read", { input: {}, services: { notes: { read: () => "one" } }, context });

// @ts-expect-error Mapped error codes are strings.
defineFeature({ ...feature, mapError: () => ({ code: 42 }) });
// @ts-expect-error Feature error classification is synchronous.
defineFeature({ ...feature, mapError: async () => ({ code: "INVALID_INPUT" }) });

const wrapped = author({ ...read, execute: () => capabilityResponse("one") });
void wrapped;
// @ts-expect-error Typed response wrappers must preserve the capability output schema.
author({ ...read, execute: () => capabilityResponse(42) });
// @ts-expect-error Session effects cannot invent an operation.
capabilityResponse("one", { type: "session", operation: "unknown" });

const resource = author({
    ...read,
    mocks: undefined,
    output: contractBinary({ maxBytes: 4, resource: true }),
    execute: () => resourceResponse(new Response("data")),
});
void resource;
// @ts-expect-error Resource envelopes cannot replace a structured JSON output.
author({ ...read, execute: () => resourceResponse(new Response("data")) });
