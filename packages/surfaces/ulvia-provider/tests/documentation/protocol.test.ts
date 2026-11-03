import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { CmsDocumentation } from "@bernouy/cms-documentation";
import { CapabilityMcpBinding } from "@bernouy/cms-gateway/mcp";
import { compileProviderRoutes } from "@bernouy/cms-gateway/provider/server";
import { NOOP_LOGGER } from "@bernouy/logging";
import { DefaultProviderCapabilityDispatcher } from "@bernouy/ulvia-provider";
import { registerDocumentationCapabilities } from "../../src/capabilities/installations/providers/documentation";
import { createProviderContractRelay } from "../../src/transport/relay";
import { officialContract, resolvedContract, invokeHttp, context, bootstrap } from "../execution/messages/fixtures";

test("HTTP and MCP expose exact selected documentation with discoverable lightweight references", async () => {
    const admission = await officialContract("ulvia.cms.installations");
    let reads = 0;
    const service = new CmsDocumentation({
        resolve: async () => ({ revision: "1", releases: [admission] }),
        isCurrent: async () => true,
        read: async (reference) => {
            reads++;
            return Bun.file(resolve(bootstrap, "contracts/cms", reference.contractId, "docs", reference.path));
        },
    });
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    registerDocumentationCapabilities(dispatcher, service);
    const contract = await resolvedContract(admission.release.contractId);
    const binding = new CapabilityMcpBinding({
        contracts: async () => [admission],
        invoker: {
            invoke: async (call) => ({
                kind: "success",
                requestId: "docs",
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
    const search = tools.find((tool) => tool.name === "installations_documentation_search")!;
    expect(search.description).toContain("Related documentation");
    expect(search._meta).toMatchObject({
        "io.ulvia/docs": [{ reference: { path: "overview.md" } }, { reference: { path: "documentation.md" } }],
    });
    expect(reads).toBe(0);
    const response = await invokeHttp(contract, dispatcher, "documentation.search", { query: "documentation.search" });
    expect(response.status).toBe(200);
    const output = await response.json();
    expect(output).toMatchObject({ mode: "lexical", degraded: true });
    expect(output.results.length).toBeGreaterThan(0);
    const reference = output.results[0].reference;
    expect(reference.releaseDigest).toBe(admission.digest);
    const result = await binding.call("installations_documentation_get", { input: { reference } }, actor);
    expect(result.structuredContent).toMatchObject({ output: { reference, content: expect.stringContaining("# ") } });
    const before = reads;
    const invalid = await invokeHttp(contract, dispatcher, "documentation.get", {
        reference: { ...reference, releaseDigest: `sha256:${"0".repeat(64)}` },
    });
    expect(invalid.status).toBe(409);
    expect(await invalid.json()).toMatchObject({
        error: { code: "REVISION_CONFLICT", output: { message: expect.any(String) } },
    });
    expect(reads).toBe(before);
    const injected = await invokeHttp(contract, dispatcher, "documentation.search", {
        query: "docs",
        siteId: "another-instance",
    });
    expect([400, 422]).toContain(injected.status);
    expect(reads).toBe(before);
    const onboarding = await binding.call(
        "installations_documentation_search",
        {
            input: { query: "Working with Ulvia", contractId: admission.release.contractId, limit: 10 },
        },
        actor,
    );
    const guides = (
        onboarding.structuredContent as {
            output: { results: { reference: { contractId: string; releaseDigest: string; path: string } }[] };
        }
    ).output.results;
    const guide = guides.find((item) => item.reference.path === "working-with-ulvia.md");
    expect(guide?.reference).toEqual({
        contractId: admission.release.contractId,
        releaseDigest: admission.digest,
        path: "working-with-ulvia.md",
    });
    const introduction = await binding.call(
        "installations_documentation_get",
        { input: { reference: guide!.reference } },
        actor,
    );
    expect(introduction.structuredContent).toMatchObject({
        output: {
            reference: guide!.reference,
            content: expect.stringContaining("# Working with Ulvia"),
            nextOffset: null,
        },
    });
});

test("a live authorization refusal cannot read or index documentation", async () => {
    let resolutions = 0;
    const service = new CmsDocumentation({
        resolve: async () => {
            resolutions++;
            return { revision: "1", releases: [] };
        },
        read: async () => null,
        isCurrent: async () => true,
    });
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    registerDocumentationCapabilities(dispatcher, service);
    const contract = await resolvedContract("ulvia.cms.installations");
    const routes = compileProviderRoutes([contract]);
    const route = routes.find((entry) => entry.capability.id === "documentation.search")!;
    const relay = createProviderContractRelay(
        routes,
        dispatcher,
        { siteId: "default", providerId: "ulvia.official" },
        NOOP_LOGGER,
        async () => false,
    );
    const requestId = crypto.randomUUID();
    const response = await relay(
        new Request(`https://provider.test${route.capability.binding.path}`, {
            method: "QUERY",
            headers: { "content-type": "application/json", "x-ulvia-request-id": requestId },
            body: JSON.stringify({ query: "docs" }),
        }),
        {
            version: 1,
            requestId,
            instanceId: "instance-a",
            contractId: contract.release.contractId,
            contractVersion: contract.release.version,
            capabilityId: "documentation.search",
            issuedAt: 0,
            expiresAt: 9999999999,
        },
    );
    expect(response?.status).toBe(403);
    expect(resolutions).toBe(0);
});
