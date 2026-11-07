import { capabilitiesFor, contractString, defineFeature, implementFeature, z } from "@bernouy/ulvia-sdk";
import type { CompiledImplementations } from "@bernouy/ulvia-sdk";
import { compileImplementations, createImplementationArtifact } from "@bernouy/ulvia-sdk/build";
import { registerProviderHandlers } from "@bernouy/ulvia-sdk/provider";
import type { ProviderRegistrationOptions } from "@bernouy/ulvia-sdk/provider";
import { DefaultProviderCapabilityDispatcher } from "@bernouy/cms-gateway/provider/server";

export interface Services {
    allowed(id: string): Promise<boolean>;
    read(id: string): Promise<string>;
}
const author = capabilitiesFor<Services>();
export async function artifactFixture(keyed = false) {
    const capability = author({
        id: "read",
        access: "admin",
        behavior: keyed
            ? { effect: "command", idempotency: "keyed", execution: "sync", sensitive: true }
            : { effect: "query", execution: "sync", sensitive: false },
        bindings: [
            {
                id: "http",
                transport: "http",
                method: keyed ? "POST" : "QUERY",
                path: "/read",
                input: { body: true },
                response: {
                    successStatuses: [200],
                    contentTypes: ["application/json"],
                    errorStatuses: { DENIED: 403 },
                },
            },
        ],
        input: z.strictObject({ id: contractString({ maxLength: 128 }) }),
        output: contractString({ maxLength: 128 }),
        errors: {
            DENIED: { retryable: false, output: z.strictObject({ message: contractString({ maxLength: 128 }) }) },
        },
        authorize: async ({ input, services, fail }) => {
            if (!(await services.allowed(input.id))) {
                throw fail("DENIED", { message: "Denied" });
            }
        },
        execute: ({ input, services }) => services.read(input.id),
    });
    const feature = defineFeature({
        contractId: "example/artifact",
        name: "Artifact",
        version: "1.0.0",
        publisherId: "example",
        capabilities: [capability],
        documents: { "overview.md": "# Artifact\n\nRuntime fixture.\n" },
    });
    const implementation = implementFeature(feature);
    const build = await compileImplementations([implementation]);
    return {
        capability,
        feature,
        implementation,
        build,
        artifact: JSON.parse(JSON.stringify(createImplementationArtifact(build))),
    };
}

export function mounted(
    build: CompiledImplementations<Services>,
    services: Services,
    options: Partial<ProviderRegistrationOptions> = {},
) {
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    registerProviderHandlers(build, dispatcher, services, {
        providerId: "example/provider",
        scope: { siteId: "site", instanceId: "instance" },
        ...options,
    });
    dispatcher.seal(build.implementedContracts);
    return () =>
        dispatcher.invoke(
            "example/artifact",
            "read",
            { id: "one" },
            {
                providerId: "example/provider",
                siteId: "site",
                contractVersion: "1.0.0",
                requestId: crypto.randomUUID(),
                invocation: { contractId: "example/artifact", instanceId: "instance" },
                idempotencyKey: "key-1",
                http: {
                    headers: new Headers(),
                    transportRequest: new Request("http://provider.test/read", {
                        method:
                            build.implementedContracts[0]!.capabilities[0]!.definition.behavior.effect === "query"
                                ? "QUERY"
                                : "POST",
                    }),
                },
            },
        );
}
