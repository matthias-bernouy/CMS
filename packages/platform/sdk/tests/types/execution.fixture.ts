import { defineFeature } from "@bernouy/ulvia-sdk";
import { contractString, capabilitiesFor, implementFeature, z } from "@bernouy/ulvia-sdk";
import { notesProviderDefinition } from "../../examples/provider";
import { compileProvider } from "@bernouy/ulvia-sdk/build";
import { createProvider } from "@bernouy/ulvia-sdk/provider";
import { executeCapability } from "@bernouy/ulvia-sdk/local";

interface Services {
    notes: { read(id: string): Promise<string> };
}
const defineCapability = capabilitiesFor<Services>();
const read = defineCapability({
    id: "notes.read",
    access: "public",
    behavior: { effect: "query", execution: "sync", sensitive: false },
    bindings: [],
    input: z.strictObject({ id: contractString({ maxLength: 128 }) }),
    output: contractString({ maxLength: 128 }),
    errors: {},
    execute: ({ input, services }) => services.notes.read(input.id),
});
const feature = defineFeature({
    contractId: "example/execution",
    name: "Execution",
    publisherId: "example",
    version: "1.0.0",
    capabilities: [read],
});
implementFeature(feature);
executeCapability(read, {
    input: { id: "one" },
    services: { notes: { read: async (id) => id } },
    context: { requestId: "request", contractVersion: "1.0.0", siteId: "site", providerId: "example/provider" },
});

const checked = defineCapability({
    ...read,
    errors: { MISSING: { retryable: false, output: z.strictObject({ message: contractString({ maxLength: 128 }) }) } },
    execute: ({ input, services, fail }) => {
        // @ts-expect-error Input fields are inferred from this operation's schema.
        void input.unknown;
        // @ts-expect-error Other feature services are not in the local context.
        void services.files;
        // @ts-expect-error Declared error codes remain exact inside execute.
        fail("UNKNOWN", { message: "Missing" });
        // @ts-expect-error Error payload fields remain typed inside execute.
        fail("MISSING", { message: 42 });
        return services.notes.read(input.id);
    },
});
const wrongOutput = { ...read, execute: () => 42 };
// @ts-expect-error An executor must return the operation's declared output.
defineCapability(wrongOutput);

interface ChildServices extends Services {
    settings: { enabled(): boolean };
}
const child = capabilitiesFor<ChildServices>();
const status = child({
    ...read,
    id: "notes.enabled",
    input: z.strictObject({}),
    output: z.boolean(),
    mocks: [],
    execute: ({ services }) => services.settings.enabled(),
});
const childFeature = defineFeature({
    contractId: "example/child",
    name: "Child",
    publisherId: "example",
    version: "1.0.0",
    extends: feature,
    capabilities: [status],
});
const incompatible = capabilitiesFor<{ notes: { read(id: string): Promise<number> } }>();
const wrongRead = incompatible({
    ...read,
    execute: ({ services, input }) => services.notes.read(input.id).then(String),
});
defineFeature({
    contractId: "example/incompatible",
    name: "Incompatible",
    publisherId: "example",
    version: "1.0.0",
    // @ts-expect-error A child cannot replace a parent's service port with an incompatible one.
    extends: feature,
    capabilities: [wrongRead],
});
const missingServices = { files: { count: () => 1 } };
executeCapability(read, {
    input: { id: "one" },
    // @ts-expect-error Validated local execution requires the operation's own services.
    services: missingServices,
    context: { requestId: "request", contractVersion: "1.0.0", siteId: "site", providerId: "example/provider" },
});
const badProjection = (_host: {}) => missingServices;
// @ts-expect-error Host projections must satisfy the complete feature service requirements.
implementFeature(feature, { services: badProjection });

async function runtimeServices(): Promise<void> {
    const build = await compileProvider({
        ...notesProviderDefinition("http://127.0.0.1:5103"),
        implementations: [implementFeature(feature)],
    });
    createProvider(
        build,
        // @ts-expect-error Default feature services remain mandatory at Provider mounting.
        {},
        {
            scope: { siteId: "site", instanceId: "instance" },
            authenticate: async () => null,
            authorize: async () => true,
        },
    );
}
void [checked, childFeature, runtimeServices];
