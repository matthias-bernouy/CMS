import { test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mcpContainers } from "../../integration/instance/containers";
import { exerciseCli } from "../../integration/instance/repository/clientFlows";

const images = { edge: process.env.ULVIA_MCP_EDGE_DOCKER_IMAGE, provider: process.env.ULVIA_MCP_PROVIDER_DOCKER_IMAGE };

test.skipIf(!images.edge || !images.provider)(
    "CLI PAT login, namespace claims, release, push, pull, yank and logout use the real CMS Repository",
    async () => {
        const directory = await mkdtemp(join(tmpdir(), "repository-cli-images-"));
        let f: Awaited<ReturnType<typeof mcpContainers>> | undefined;
        try {
            f = await mcpContainers(images as Record<keyof typeof images, string>);
            await exerciseCli(directory, f.repositoryUrl, f.repository.pat.token);
        } finally {
            await f?.close();
            await rm(directory, { recursive: true, force: true });
        }
    },
    240_000,
);
