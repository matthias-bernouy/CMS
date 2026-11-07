import { capabilityToolName } from "@bernouy/cms-gateway/mcp";
import { expect, test } from "bun:test";
import { admitContractRelease } from "@bernouy/ulvia-contracts";
import { createAuthoringResources } from "cms-edge/http/mcp/resources";
import type { CmsMcpHost } from "cms-edge/http/mcp/protocol";
import type { GatewayInvocation } from "@bernouy/cms-gateway";
import { createMcpTestContract } from "./contracts";
import { cmsMcpInstructions } from "cms-edge/http/mcp/instructions";
import { GatewayError } from "@bernouy/cms-gateway";

test("stable MCP guide URIs read the selected release through authorized documentation calls", async () => {
    const contract = await admitContractRelease({
        ...(await createMcpTestContract()).release,
        kind: "contract",
        protocol: "ulvia-provider/v1",
        schemaDialect: "ulvia-schema/v1",
        publisherId: "ulvia",
        contractId: "ulvia/cms.files",
        name: "Files",
        version: "1.0.0",
        documentation: [{ path: "site-files.md", title: "Files", byteLength: 8, digest: `sha256:${"1".repeat(64)}` }],
    });
    const calls: GatewayInvocation[] = [];
    const host: CmsMcpHost = {
        publicUrl: "https://cms.test/.cms/mcp",
        resolveActor: async () => ({ kind: "anonymous" }),
        invoker: {
            resolveContract: async () => contract,
            invoke: async (call) => {
                calls.push(call);
                return {
                    kind: "success",
                    requestId: "guide",
                    output:
                        call.input && (call.input as { offset: number }).offset === 0
                            ? { content: "# Files\n", nextOffset: 8 }
                            : { content: "Read the upload flow.\n", nextOffset: null },
                };
            },
        },
    };
    const resources = createAuthoringResources(host);
    const context = { siteId: "default", actor: { kind: "administrator" as const, subjectId: "admin" } };
    expect((await resources.list(context)).resources).toHaveLength(4);
    expect(calls).toHaveLength(0);
    const result = await resources.read("ulvia://cms/site-files", context);
    expect(result.contents[0]?.text).toBe("# Files\nRead the upload flow.\n");
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({
        ...context,
        contractId: "ulvia/cms.installations",
        capabilityId: "documentation.get",
        input: {
            reference: { contractId: "ulvia/cms.files", releaseDigest: contract.digest, path: "site-files.md" },
            offset: 0,
        },
    });
    host.invoker.invoke = async () => ({
        kind: "declared-error",
        requestId: "refused",
        errorCode: "FORBIDDEN",
        retryable: false,
    });
    await expect(resources.read("ulvia://cms/site-files", context)).rejects.toThrow("Documentation read failed");
});

test("onboarding pins the selected site's guide and actual reading tool without reading documents", async () => {
    const base = (await createMcpTestContract()).release;
    const create = (version: string, withGuide = true) =>
        admitContractRelease({
            ...base,
            contractId: "ulvia/cms.installations",
            publisherId: "ulvia",
            version,
            documentation: withGuide
                ? [
                      {
                          path: "working-with-ulvia.md",
                          title: "Working with Ulvia",
                          byteLength: 20,
                          digest: `sha256:${"1".repeat(64)}`,
                      },
                  ]
                : [],
            capabilities: [
                {
                    ...base.capabilities[0],
                    id: "documentation.get",
                    bindings: [{ id: "read", transport: "mcp", tool: { name: "selected_guide_reader" } }],
                },
            ],
        });
    let selected = await create("1.0.0");
    let resolutions = 0;
    const context = { siteId: "site-b", actor: { kind: "administrator" as const, subjectId: "admin" } };
    const host: CmsMcpHost = {
        publicUrl: "https://cms.test",
        resolveActor: async () => context.actor,
        invoker: {
            resolveContract: async (scope) => {
                expect(scope).toEqual({ siteId: "site-b", contractId: "ulvia/cms.installations" });
                resolutions++;
                return selected;
            },
            invoke: async () => {
                throw new Error("Instructions must not invoke capabilities");
            },
        },
    };
    const first = await cmsMcpInstructions(host, context);
    expect(resolutions).toBe(1);
    expect(first).toContain(
        `MCP tool ${capabilityToolName("ulvia/cms.installations", "documentation.get", "read", "selected_guide_reader")} with arguments {"input":{"reference":`,
    );
    expect(first).toContain(selected.digest);
    expect(first).toContain('"path":"working-with-ulvia.md"');
    const oldDigest = selected.digest;
    selected = await create("1.0.1");
    const next = await cmsMcpInstructions(host, context);
    expect(next).toContain(selected.digest);
    expect(next).not.toContain(oldDigest);
    selected = await create("1.0.0", false);
    expect(await cmsMcpInstructions(host, context)).not.toContain('"releaseDigest"');
    host.invoker.resolveContract = async () => {
        throw new GatewayError("not_selected", "Not selected");
    };
    expect(await cmsMcpInstructions(host, context)).toContain("documentation.search");
    host.invoker.resolveContract = async () => {
        throw new Error("Unavailable");
    };
    await expect(cmsMcpInstructions(host, context)).rejects.toThrow("Unavailable");
});
