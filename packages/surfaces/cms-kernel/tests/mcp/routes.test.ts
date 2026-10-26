import { expect, test } from "bun:test";
import { KernelCms } from "@bernouy/cms-kernel";
import { BunRunner, TtlCache } from "@bernouy/http-runner";
import { createContentReader, InMemoryContentRepository } from "@bernouy/cms-content";
import { NOOP_LOGGER } from "@bernouy/logging";
import { cmsMcpFixture } from "./fixture";

test("Kernel registers MCP and OAuth routes on the actual HTTP runner without relying on a page fallback", async () => {
    const f = await cmsMcpFixture();
    const runner = new BunRunner();
    new KernelCms({
        runner,
        cache: new TtlCache(),
        content: createContentReader(new InMemoryContentRepository()),
        mcpHandler: f.handle,
        resolveActor: async () => ({ kind: "anonymous" }),
        robotsHandler: async () => new Response(null, { status: 404 }),
        sitemapHandler: async () => new Response(null, { status: 404 }),
        sitemapChunkHandler: async () => new Response(null, { status: 404 }),
        logger: NOOP_LOGGER,
    });
    runner.start({ hostname: "127.0.0.1", port: 0 });
    const base = `http://127.0.0.1:${runner.port}`;
    try {
        expect((await fetch(`${base}/.cms/mcp`, { method: "POST", body: "{}" })).status).toBe(401);
        expect((await fetch(`${base}/.well-known/oauth-authorization-server`)).status).toBe(200);
        expect(
            (
                await fetch(`${base}/.cms/oauth/register`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        client_name: "Runner regression",
                        redirect_uris: ["https://client.example/callback"],
                    }),
                })
            ).status,
        ).toBe(201);
        expect((await fetch(`${base}/.cms/mcp/uploads/upload-123`, { method: "PUT", body: "data" })).status).toBe(401);
    } finally {
        runner.stop();
    }
});
