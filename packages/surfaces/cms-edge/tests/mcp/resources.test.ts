import { expect, test } from "bun:test";
import { admitContractRelease } from "@bernouy/cms-repository/contracts";
import { createAuthoringResources } from "cms-edge/http/mcp/resources";
import type { CmsMcpHost } from "cms-edge/http/mcp/protocol";
import type { GatewayInvocation } from "@bernouy/cms-gateway";
import { createMcpTestContract } from "./contracts";

test("stable MCP guide URIs read the selected release through authorized documentation calls", async () => {
    const contract = await admitContractRelease({
        ...(await createMcpTestContract()).release,
        kind: "contract",
        protocol: "ulvia-provider/v1",
        schemaDialect: "ulvia-schema/v1",
        publisherId: "example",
        contractId: "ulvia.cms.files",
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
        contractId: "ulvia.cms.installations",
        capabilityId: "documentation.get",
        input: {
            reference: { contractId: "ulvia.cms.files", releaseDigest: contract.digest, path: "site-files.md" },
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
