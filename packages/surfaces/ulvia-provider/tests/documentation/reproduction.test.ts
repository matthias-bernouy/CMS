import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { CmsDocumentation } from "@bernouy/documentation";
import { CapabilityMcpBinding, capabilityToolName } from "@bernouy/cms-gateway/mcp";
import { resourceName } from "@bernouy/ulvia-contracts/protocol";
import { DefaultProviderCapabilityDispatcher } from "@bernouy/ulvia-provider";
import { mountInstallations } from "../execution/installations/mount";
import { officialContract, context, bootstrap } from "../execution/messages/fixtures";

test("a fresh MCP client can discover the reproduction workflow and its exact selected guide", async () => {
    const authoring = await officialContract("ulvia/cms.authoring");
    const installations = await officialContract("ulvia/cms.installations");
    const documentation = new CmsDocumentation({
        resolve: async () => ({ revision: "1", releases: [authoring, installations] }),
        isCurrent: async () => true,
        read: async (reference) =>
            Bun.file(resolve(bootstrap, "contracts/cms", resourceName(reference.contractId), "docs", reference.path)),
    });
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    await mountInstallations(dispatcher, { documentation });
    const binding = new CapabilityMcpBinding({
        contracts: async () => [authoring, installations],
        invoker: {
            invoke: async (call) => ({
                kind: "success",
                requestId: "reproduction-docs",
                output: await dispatcher.invoke(
                    call.contractId,
                    call.capabilityId,
                    call.input as Record<string, unknown>,
                    context("en", installations.release.version),
                ),
            }),
        },
    });
    const actor = { siteId: "default", actor: { kind: "administrator" as const, subjectId: "admin" } };
    const prepare = (await binding.list(actor)).tools.find(
        (tool) =>
            tool.name ===
            capabilityToolName(
                authoring.release.contractId,
                "prepare-collection",
                "mcp",
                "authoring_prepare_collection",
            ),
    );
    expect(prepare?.description).toContain("site-reproduction.md");
    expect(JSON.stringify(prepare?._meta)).toContain("site-reproduction.md");
    const reference = {
        contractId: authoring.release.contractId,
        releaseDigest: authoring.digest,
        path: "site-reproduction.md",
    };
    for (const query of ["reproduce this website", "clone this site", "recopier ce site"]) {
        const result = await binding.call(
            capabilityToolName(
                installations.release.contractId,
                "documentation.search",
                "mcp",
                "installations_documentation_search",
            ),
            { input: { query, limit: 5 } },
            actor,
        );
        expect(result.structuredContent).toMatchObject({
            output: { results: expect.arrayContaining([expect.objectContaining({ reference })]) },
        });
    }
    const result = await binding.call(
        capabilityToolName(
            installations.release.contractId,
            "documentation.get",
            "mcp",
            "installations_documentation_get",
        ),
        { input: { reference } },
        actor,
    );
    expect(result.structuredContent).toMatchObject({
        output: {
            reference,
            content: expect.stringContaining("# Reproduce an existing site"),
            nextOffset: null,
        },
    });
});
