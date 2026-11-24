import {
    capabilitiesFor,
    schemaResolversFor,
    contractResolved,
    contractString,
    schemaDescriptorWire,
    defineFeature,
    implementFeature,
    z,
} from "@bernouy/ulvia-sdk";
import { SchemaResolutionError } from "@bernouy/ulvia-contracts/resolution";
import type { SchemaVersionStore } from "@bernouy/cms-gateway/provider/server";
import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { notesProviderDefinition } from "../../../examples/provider";
export function dynamicFixture() {
    const state = { calls: 0, resolutions: 0, denyResolver: false, malformedOutput: false, changed: false };
    const selector = z.strictObject({ formId: contractString({ maxLength: 64 }) });
    const resolver = schemaResolversFor<{}>()({
        id: "forms.describe",
        path: "/schema",
        access: "public",
        selector,
        authorize: ({ fail }) => {
            if (state.denyResolver) {
                throw fail("FORBIDDEN", { message: "Denied" });
            }
        },
        execute: () => {
            state.resolutions++;
            return schemaDescriptorWire({
                resourceId: "contact",
                version: "1",
                fields: [],
                schema: {
                    type: "object",
                    properties: { email: state.changed ? { type: "boolean" } : { type: "string", maxLength: 64 } },
                    required: ["email"],
                },
            });
        },
    });
    const input = z.strictObject({
        formId: contractString({ maxLength: 64 }),
        formVersion: z.int(),
        payload: contractResolved({
            resolver: resolver.id,
            selector: { formId: { source: "value", path: "/formId" } },
            version: { source: "value", path: "/formVersion" },
        }),
    });
    const capability = capabilitiesFor<{}>()({
        id: "read",
        access: "public",
        behavior: { effect: "query", execution: "sync", sensitive: false },
        input,
        output: z.strictObject({
            echo: contractResolved({
                resolver: resolver.id,
                selector: { formId: { source: "input", path: "/formId" } },
                version: { source: "input", path: "/formVersion" },
            }),
        }),
        errors: {},
        bindings: [
            {
                id: "http",
                transport: "http",
                method: "QUERY",
                path: "/read",
                input: { body: true },
                response: { successStatuses: [200], contentTypes: ["application/json"], errorStatuses: {} },
            },
        ],
        execute: ({ input }) => {
            state.calls++;
            return { echo: state.malformedOutput ? { email: 3 } : input.payload };
        },
    });
    const feature = defineFeature({
        contractId: "example/dynamic",
        publisherId: "example",
        name: "Dynamic",
        version: "1.0.0",
        capabilities: [resolver, capability],
    });
    const provider = {
        ...notesProviderDefinition("http://127.0.0.1:5103"),
        implementations: [implementFeature(feature)],
    };
    // Unit-only authority; production requires the host's durable store (Mongo is tested independently).
    const seals = new Map<string, string>();
    const versions: SchemaVersionStore = {
        seal: async (scope, descriptor) => {
            const key = canonicalizeIJson({ ...scope, resourceId: descriptor.resourceId, version: descriptor.version });
            const previous = seals.get(key);
            if (previous && previous !== descriptor.digest) {
                throw new SchemaResolutionError("SCHEMA_VERSION_CONFLICT");
            }
            seals.set(key, descriptor.digest);
        },
    };
    return { state, feature, provider, capability, resolver, versions };
}
export const value = { formId: "contact", formVersion: 1, payload: { email: "a@example.test" } };
