import { expect, test } from "bun:test";
import { admitContractRelease } from "@bernouy/ulvia-contracts";
import {
    capabilitiesFor,
    contractString,
    defineFeature,
    implementFeature,
    z,
    capabilityResponse,
} from "@bernouy/ulvia-sdk";
import { compileImplementations } from "@bernouy/ulvia-sdk/build";
import { loadCompatibleImplementation, registerProviderHandlers } from "@bernouy/ulvia-sdk/provider";
import { DefaultProviderCapabilityDispatcher, createProviderHandler } from "@bernouy/cms-gateway/provider/server";
import type { CompiledImplementations } from "@bernouy/ulvia-sdk";
interface Services {
    allowed: boolean;
    response: { value: string; extra?: string };
}
async function fixture() {
    const read = capabilitiesFor<Services>()({
        id: "read",
        access: "admin",
        behavior: { effect: "query", execution: "sync", sensitive: false },
        input: z.strictObject({}),
        output: z.strictObject({
            value: contractString({ maxLength: 128 }),
            extra: contractString({ maxLength: 128 }).optional(),
        }),
        errors: { DENIED: { retryable: false } },
        bindings: [
            {
                id: "http",
                transport: "http",
                method: "GET",
                path: "/read",
                input: {},
                response: {
                    successStatuses: [200],
                    contentTypes: ["application/json"],
                    errorStatuses: { DENIED: 403 },
                },
            },
        ],
        authorize: ({ services, fail }) => {
            if (!services.allowed) {
                throw fail("DENIED");
            }
        },
        execute: ({ services }) => capabilityResponse(services.response, undefined, { contentLanguage: "fr" }),
    });
    const build = await compileImplementations([
        implementFeature(
            defineFeature({
                contractId: "example/projected",
                publisherId: "example",
                name: "Projected",
                version: "1.1.0",
                capabilities: [read],
            }),
        ),
    ]);
    const release = structuredClone(build.contracts[0]!.release);
    const capability = release.capabilities[0]!;
    const old = await admitContractRelease({
        ...release,
        version: "1.0.0",
        capabilities: [
            {
                ...capability,
                output: {
                    type: "object",
                    properties: { value: { type: "string", maxLength: 128 } },
                    required: ["value"],
                },
            },
        ],
    });
    return { build, old };
}
function mount(build: CompiledImplementations<Services>, services: Services) {
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    registerProviderHandlers(build, dispatcher, services, {
        providerId: "example/provider",
        scope: { siteId: "site", instanceId: "instance" },
    });
    const version = build.contracts[0]!.release.version;
    const requestId = crypto.randomUUID();
    const handler = createProviderHandler({
        contracts: build.implementedContracts,
        dispatcher,
        authorize: async () => true,
        authenticate: async () => ({
            providerId: "example/provider",
            siteId: "site",
            claims: {
                version: 1,
                requestId,
                instanceId: "instance",
                contractId: "example/projected",
                contractVersion: version,
                capabilityId: "read",
                issuedAt: 1,
                expiresAt: 2,
            },
        }),
    });
    return () => handler(new Request("http://provider.test/read", { headers: { "x-ulvia-request-id": requestId } }));
}
test("retained HTTP results project declared additions while preserving representation and live authorization", async () => {
    const { build, old } = await fixture();
    const retained = await loadCompatibleImplementation(build, build.implementations[0]!, old);
    const services: Services = { allowed: true, response: { value: "Original", extra: "New field" } };
    const call = mount(retained, services);
    const response = await call();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-language")).toBe("fr");
    expect(await response.json()).toEqual({ value: "Original" });
    services.allowed = false;
    expect((await call()).status).toBe(403);
});
test("retained projection rejects malformed source data and ordinary current handlers remain strict", async () => {
    const { build, old } = await fixture();
    const retained = await loadCompatibleImplementation(build, build.implementations[0]!, old);
    const response = Object.assign({ value: "Original", extra: "New" }, { unexpected: "Undeclared" });
    expect((await mount(retained, { allowed: true, response })()).status).toBe(503);
    expect((await mount(build, { allowed: true, response })()).status).toBe(503);
});
