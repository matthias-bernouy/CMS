import { test } from "bun:test";
import { mcpContainers } from "./containers";
import { connectBrowser } from "./oauth";
import { exerciseMutationFreshness } from "./performance/freshness/mutations";
const images = {
    edge: process.env.ULVIA_MCP_EDGE_DOCKER_IMAGE,
    provider: process.env.ULVIA_MCP_PROVIDER_DOCKER_IMAGE,
    repository: process.env.ULVIA_REPOSITORY_DOCKER_IMAGE,
};
const integration = Object.values(images).every(Boolean) ? test : test.skip;
integration(
    "completed collection, selection and file mutations are visible after an anonymous cache hit",
    async () => {
        const stack = await mcpContainers(images as Record<keyof typeof images, string>);
        let connection: Awaited<ReturnType<typeof connectBrowser>> | undefined;
        try {
            connection = await connectBrowser(stack.cmsUrl, stack.administrator);
            await exerciseMutationFreshness(connection, stack.cmsUrl);
        } catch (error) {
            throw new Error(`${String(error)}\n${await stack.diagnostics()}`);
        } finally {
            await connection?.browser.close();
            await stack.close();
        }
    },
    180_000,
);
