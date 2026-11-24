import { InMemoryReleaseCatalogue } from "@bernouy/repository/contracts/catalogue";
import { expect, test } from "bun:test";
import { schemaResolversFor, defineFeature, contractString, schemaDescriptorWire, z } from "@bernouy/ulvia-sdk";
import { compileContract } from "@bernouy/ulvia-sdk/build";
import { resolveContract } from "@bernouy/ulvia-contracts";
import { compileProviderRoutes } from "@bernouy/cms-gateway/provider/server";
import { NOOP_LOGGER } from "@bernouy/logging";
import { DefaultProviderCapabilityDispatcher } from "../../../../src/dispatch/registry";
import { createProviderContractRelay } from "../../../../src/transport/relay";

test("the official relay forwards the durable schema store to both receiver paths", async () => {
    const wire = schemaDescriptorWire({ resourceId: "contact", version: "1", fields: [], schema: { type: "boolean" } });
    for (const contractId of ["example/schemas", "ulvia/cms.observability"]) {
        const resolver = schemaResolversFor<{}>()({
            id: "describe",
            path: "/schema",
            selector: z.strictObject({ id: contractString({ maxLength: 64 }) }),
            authorize: () => {},
            execute: () => wire,
        });
        const admission = await compileContract(
            defineFeature({
                contractId,
                publisherId: contractId.split("/")[0]!,
                name: "Schema",
                version: "1.0.0",
                capabilities: [resolver],
            }),
        );
        const contract = await resolveContract(new InMemoryReleaseCatalogue(), admission);
        const dispatcher = new DefaultProviderCapabilityDispatcher([contract]);
        dispatcher.register(contractId, "describe", async () => wire);
        dispatcher.seal([contract]);
        let seals = 0;
        const relay = createProviderContractRelay(
            compileProviderRoutes([contract]),
            dispatcher,
            { siteId: "site", providerId: "example/provider" },
            NOOP_LOGGER,
            async () => true,
            undefined,
            {
                seal: async (scope, descriptor) => {
                    expect(scope.installationId).toBe("installed");
                    expect(descriptor.version).toBe("1");
                    seals++;
                },
            },
        );
        const requestId = crypto.randomUUID();
        const request = new Request("http://provider.test/schema", {
            method: "QUERY",
            headers: { "content-type": "application/json", "x-ulvia-request-id": requestId },
            body: JSON.stringify({ selectorJson: '{"id":"contact"}' }),
        });
        const response = await relay(request, {
            version: 1,
            requestId,
            instanceId: "instance",
            connectionId: "installed",
            contractId,
            contractVersion: "1.0.0",
            capabilityId: "describe",
            issuedAt: 1,
            expiresAt: 2,
        });
        expect(response?.status).toBe(200);
        expect(seals).toBe(1);
    }
});
