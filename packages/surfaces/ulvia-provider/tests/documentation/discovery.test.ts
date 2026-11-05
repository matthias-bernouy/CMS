import { capabilityToolName } from "@bernouy/cms-gateway/mcp";
import { expect, test } from "bun:test";
import { CapabilityMcpBinding } from "@bernouy/cms-gateway/mcp";
import { compileProviderRoutes } from "@bernouy/cms-gateway/provider/server";
import { RepositoryDiscovery } from "@bernouy/cms-repository/repository/search";
import { NOOP_LOGGER } from "@bernouy/logging";
import { DefaultProviderCapabilityDispatcher } from "@bernouy/ulvia-provider";
import { registerRepositoryDiscoveryCapabilities } from "../../src/capabilities/installations/providers/discovery";
import { createProviderContractRelay } from "../../src/transport/relay";
import { officialContract, resolvedContract, invokeHttp, context } from "../execution/messages/fixtures";

test("MCP discovers repository tools and reads a verified uninstalled contract through its HTTP bindings", async () => {
    const admission = await officialContract("ulvia/cms.installations");
    const reference = {
        kind: "contract" as const,
        publisherId: admission.release.publisherId,
        id: admission.release.contractId,
        version: admission.release.version,
        digest: admission.digest,
    };
    const discovery = new RepositoryDiscovery([
        {
            id: "configured",
            search: async () => ({
                revision: admission.digest,
                mode: "lexical",
                degraded: true,
                results: [
                    {
                        reference,
                        name: admission.release.name,
                        description: "Installations",
                        categories: [],
                        contractIds: [reference.id],
                    },
                ],
            }),
            read: async () => new TextEncoder().encode(admission.canonicalJson),
        },
    ]);
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    registerRepositoryDiscoveryCapabilities(dispatcher, discovery);
    const contract = await resolvedContract(admission.release.contractId);
    const binding = new CapabilityMcpBinding({
        contracts: async () => [admission],
        invoker: {
            invoke: async (call) => ({
                kind: "success",
                requestId: "discovery",
                output: await dispatcher.invoke(
                    call.contractId,
                    call.capabilityId,
                    call.input as Record<string, unknown>,
                    context(),
                ),
            }),
        },
    });
    const actor = { siteId: "default", actor: { kind: "administrator" as const, subjectId: "admin" } };
    const tools = (await binding.list(actor)).tools;
    expect(
        tools.some(
            (tool) =>
                tool.name ===
                capabilityToolName(
                    "ulvia/cms.installations",
                    "repository.search",
                    "mcp",
                    "installations_repository_search",
                ),
        ),
    ).toBe(true);
    expect(
        tools.some(
            (tool) =>
                tool.name ===
                capabilityToolName("ulvia/cms.installations", "repository.get", "mcp", "installations_repository_get"),
        ),
    ).toBe(true);
    const search = await binding.call(
        capabilityToolName("ulvia/cms.installations", "repository.search", "mcp", "installations_repository_search"),
        { input: { query: "installations" } },
        actor,
    );
    expect(search.structuredContent).toMatchObject({
        output: { partial: false, results: [{ repositoryId: "configured", reference }] },
    });
    const read = await invokeHttp(contract, dispatcher, "repository.get", {
        repositoryId: "configured",
        reference,
        limit: 1000,
    });
    expect(read.status).toBe(200);
    expect(await read.json()).toMatchObject({
        reference,
        content: expect.stringContaining('"kind": "contract"'),
        offset: 0,
        nextOffset: expect.any(Number),
    });
    const injected = await invokeHttp(contract, dispatcher, "repository.search", {
        query: "product",
        repositoryIds: ["another-instance"],
    });
    expect(injected.status).toBe(422);
});

test("live authorization refuses repository discovery before any source access", async () => {
    let calls = 0;
    const discovery = new RepositoryDiscovery([
        {
            id: "configured",
            search: async () => {
                calls++;
                return { revision: "one", mode: "lexical", degraded: true, results: [] };
            },
            read: async () => {
                calls++;
                return new Uint8Array();
            },
        },
    ]);
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    registerRepositoryDiscoveryCapabilities(dispatcher, discovery);
    const contract = await resolvedContract("ulvia/cms.installations");
    const routes = compileProviderRoutes([contract]);
    const relay = createProviderContractRelay(
        routes,
        dispatcher,
        { siteId: "default", providerId: "ulvia/primary-provider" },
        NOOP_LOGGER,
        async () => false,
    );
    for (const capabilityId of ["repository.search", "repository.get"]) {
        const route = routes.find((entry) => entry.capability.id === capabilityId)!;
        const requestId = crypto.randomUUID();
        const input =
            capabilityId === "repository.search"
                ? { query: "product" }
                : {
                      repositoryId: "configured",
                      reference: {
                          kind: "contract",
                          publisherId: "example.official",
                          id: "example.contract",
                          version: "1.0.0",
                          digest: `sha256:${"0".repeat(64)}`,
                      },
                  };
        const response = await relay(
            new Request(`https://provider.test${route.capability.binding.path}`, {
                method: "QUERY",
                headers: { "content-type": "application/json", "x-ulvia-request-id": requestId },
                body: JSON.stringify(input),
            }),
            {
                version: 1,
                requestId,
                instanceId: "instance-a",
                contractId: contract.release.contractId,
                contractVersion: contract.release.version,
                capabilityId,
                issuedAt: 0,
                expiresAt: 9999999999,
            },
        );
        expect(response?.status).toBe(403);
    }
    expect(calls).toBe(0);
});
