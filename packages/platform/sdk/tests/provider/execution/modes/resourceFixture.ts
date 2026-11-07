import {
    capabilitiesFor,
    contractBinary,
    defineFeature,
    implementFeature,
    resourceResponse,
    z,
} from "@bernouy/ulvia-sdk";
import type { ProviderResourceResponse } from "@bernouy/ulvia-sdk";
import { compileProvider } from "@bernouy/ulvia-sdk/build";
import { notesProviderDefinition } from "../../../../examples/provider";
import { unitProvider } from "../../support/runtime";
const contractId = "example/resources";
const author = capabilitiesFor<{ read(): Response }>();
export async function resourceFixture(
    read: () => Response,
    options: {
        native?: boolean;
        wrapped?: boolean;
        metadata?: ProviderResourceResponse["metadata"];
    } = {},
) {
    const capability = author({
        id: "read",
        access: "public",
        behavior: { effect: "query", execution: "sync", sensitive: false },
        input: z.strictObject({}),
        output: contractBinary({ maxBytes: 4, ...(options.native === false ? {} : { resource: true }) }),
        errors: {},
        bindings: [
            {
                id: "http",
                transport: "http",
                method: "GET",
                path: "/resource",
                response: { successStatuses: [200], contentTypes: ["application/octet-stream"], errorStatuses: {} },
            },
        ],
        execute: ({ services }) =>
            options.wrapped === false ? services.read() : resourceResponse(services.read(), options.metadata),
    });
    const feature = defineFeature({
        contractId,
        name: "Resources",
        publisherId: "example",
        version: "1.0.0",
        capabilities: [capability],
    });
    const build = await compileProvider({
        ...notesProviderDefinition("http://127.0.0.1:5103"),
        implementations: [implementFeature(feature)],
    });
    const runtime = unitProvider(build, { read });
    return { call: (init?: RequestInit) => runtime.call(contractId, "read", "/resource", init) };
}
