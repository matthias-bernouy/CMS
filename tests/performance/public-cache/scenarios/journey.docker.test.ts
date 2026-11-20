import { test } from "bun:test";
import { publicCacheJourney } from "../journey";
import { cacheOptions } from "../plan";
const integration = process.env.ULVIA_RUN_PUBLIC_CACHE_PERFORMANCE === "1" ? test : test.skip;
integration(
    "public pages retain real cache, cold-start, revision and stylesheet evidence",
    async () => {
        const images = {
            edge: process.env.ULVIA_MCP_EDGE_DOCKER_IMAGE,
            provider: process.env.ULVIA_MCP_PROVIDER_DOCKER_IMAGE,
        };
        if (!images.edge || !images.provider) {
            throw new Error("Both candidate Docker images are required");
        }
        const options = process.env.ULVIA_PUBLIC_CACHE_OPTIONS
            ? JSON.parse(process.env.ULVIA_PUBLIC_CACHE_OPTIONS)
            : cacheOptions([]);
        // The public command validates selection before acquisition; direct tests use that same parser.
        const checked = cacheOptions([
            "--samples",
            String(options.samples),
            "--epochs",
            String(options.epochs),
            ...options.scenarios.flatMap((id: string) => ["--scenario", id]),
        ]);
        await publicCacheJourney(checked, images as { edge: string; provider: string });
    },
    7_200_000,
);
