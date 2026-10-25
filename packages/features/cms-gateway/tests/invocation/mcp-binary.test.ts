import { expect, test } from "bun:test";
import { CapabilityGateway } from "@bernouy/cms-gateway";
import { InMemoryGatewayCommandAuditStore } from "@bernouy/cms-gateway/audit";
import { CapabilityMcpBinding, capabilityToolName } from "@bernouy/cms-gateway/mcp";
import { gatewayRoute, NOW } from "../fixtures";

const context = { siteId: "site-a", actor: { kind: "anonymous" as const } };

test("binary tool inputs resolve only through the host resource port and otherwise are not advertised", async () => {
    const route = await gatewayRoute({ binaryInput: true, mcp: true });
    let received = "";
    const gateway = new CapabilityGateway({
        routes: { resolve: async () => route, isCurrent: async () => true },
        authorize: async () => true,
        now: () => NOW,
        commandAudit: new InMemoryGatewayCommandAuditStore(),
        transport: {
            async send(request) {
                received = await new Response(request.binaryBody!.stream).text();
                return { status: 204, output: null };
            },
        },
    });
    const options = { invoker: gateway, contracts: async () => [route.release.admission] };
    expect((await new CapabilityMcpBinding(options).list(context)).tools).toHaveLength(0);
    const binding = new CapabilityMcpBinding({
        ...options,
        async resolveBinary(uri) {
            if (uri !== "urn:test:asset") {
                throw new Error("Resource is outside the host scope");
            }
            return { stream: new Blob(["data"]).stream(), contentType: "application/octet-stream", contentLength: 4 };
        },
    });
    const result = await binding.call(
        capabilityToolName("catalog", "item.list"),
        { input: { uploadId: "upload-a", bytes: "urn:test:asset" } },
        context,
    );
    expect(result.structuredContent).toEqual({ output: null });
    expect(received).toBe("data");
    await expect(
        binding.call(
            capabilityToolName("catalog", "item.list"),
            { input: { uploadId: "upload-a", bytes: "https://arbitrary.test/secret" } },
            context,
        ),
    ).rejects.toThrow();
});

test("declared errors retain their contract code and retryability in MCP", async () => {
    const route = await gatewayRoute({ mcp: true });
    const gateway = new CapabilityGateway({
        routes: { resolve: async () => route, isCurrent: async () => true },
        authorize: async () => true,
        now: () => NOW,
        transport: { send: async () => ({ status: 404, contentType: "application/json", errorCode: "NOT_FOUND" }) },
    });
    const binding = new CapabilityMcpBinding({ invoker: gateway, contracts: async () => [route.release.admission] });
    const result = await binding.call(capabilityToolName("catalog", "item.list"), { input: {} }, context);
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({ error: { code: "NOT_FOUND", retryable: false } });
});
