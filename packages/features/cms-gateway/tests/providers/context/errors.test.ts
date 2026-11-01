import { expect, test } from "bun:test";
import { GatewayProviderClient } from "@bernouy/cms-gateway/provider/node";
import { admitContractRelease } from "@bernouy/cms-repository/contracts";
import { gatewayRoute } from "../../fixtures";

test("the provider client retains declared error output and safe headers", async () => {
    const base = (await gatewayRoute()).release.admission.release;
    const release = await admitContractRelease({
        ...base,
        capabilities: base.capabilities.map((capability) => ({
            ...capability,
            errors: [
                {
                    code: "NOT_FOUND",
                    retryable: false,
                    output: {
                        type: "object",
                        properties: { message: { type: "string", maxLength: 128 } },
                        required: ["message"],
                    },
                },
            ],
        })),
    });
    const server = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        fetch: () =>
            Response.json(
                { error: { code: "NOT_FOUND", output: { message: "The page contains two H1 headings" } } },
                { status: 404, headers: { "retry-after": "60" } },
            ),
    });
    try {
        const client = new GatewayProviderClient({
            cmsUrl: server.url.origin,
            token: "x".repeat(40),
            allowPrivateAddresses: true,
        });
        await expect(client.invoke(release.release, "item.list", {}, { authority: "provider" })).rejects.toMatchObject({
            code: "NOT_FOUND",
            status: 404,
            output: { message: "The page contains two H1 headings" },
            responseHeaders: { "retry-after": "60" },
        });
    } finally {
        server.stop(true);
    }
});
