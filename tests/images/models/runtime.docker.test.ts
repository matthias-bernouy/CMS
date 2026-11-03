import { expect, test } from "bun:test";
import { mcpContainers } from "../../integration/instance/containers";
import { repositoryApi } from "../../integration/instance/repository/client";

const images = { edge: process.env.ULVIA_MCP_EDGE_DOCKER_IMAGE, provider: process.env.ULVIA_MODEL_PROVIDER_IMAGE };

test.skipIf(!images.edge || !images.provider)(
    "the production CMS Repository starts and serves hybrid search on an internal network without Internet access",
    async () => {
        const f = await mcpContainers(images as Record<keyof typeof images, string>);
        try {
            const api = repositoryApi(f.repositoryUrl);
            let body: { mode: string; degraded: boolean; results: unknown[] } | undefined;
            // Search serves lexical results while background corpus preparation runs.
            for (let attempt = 0; attempt < 120; attempt++) {
                const result = await api.request("ulvia.repository", "/v1/search", "QUERY", {
                    query: "page collection",
                    limit: 3,
                });
                expect(result.status).toBe(200);
                body = await result.json();
                if (body?.mode === "hybrid") {
                    break;
                }
                await Bun.sleep(500);
            }
            expect(body?.mode).toBe("hybrid");
            expect(body?.degraded).toBe(false);
            expect(body?.results.length).toBeGreaterThan(0);
        } finally {
            await f.close();
        }
    },
    240_000,
);
