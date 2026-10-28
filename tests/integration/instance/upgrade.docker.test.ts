import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runCli } from "../../../packages/runtimes/ulvia-cli/src/cli";
import { mcpContainers } from "./containers";
import { connectBrowser } from "./oauth";

const baselineProvider = process.env.ULVIA_UPGRADE_BASELINE_PROVIDER_IMAGE;
const baselineRepository = process.env.ULVIA_UPGRADE_BASELINE_REPOSITORY_IMAGE;
const candidate = process.env.ULVIA_MCP_PROVIDER_DOCKER_IMAGE;
const edge = process.env.ULVIA_MCP_EDGE_DOCKER_IMAGE;
const integration = baselineProvider && baselineRepository && candidate && edge ? test : test.skip;

integration(
    "a real 1.0.0 instance upgrades compatibly without losing Pages or its existing MCP grant",
    async () => {
        const directory = await mkdtemp(join(tmpdir(), "ulvia-provider-upgrade-"));
        const publish = async (url: string) => {
            const options = {
                environment: { ULVIA_DATA_DIR: directory, ULVIA_CONFIG_DIR: join(directory, "config") },
                log: () => undefined,
            };
            const cli = (args: string[]) => runCli(args, options);
            await cli(["identity", "create", "test-owner"]);
            await cli(["repository", "login", url, "--identity", "test-owner"]);
            await cli(["namespace", "claim", "ulvia.official"]);
            await cli(["release", resolve(import.meta.dir, "../../../packages/official-repository"), "--recursive"]);
            await cli(["push", "all", "--repository", url]);
        };
        let stack: Awaited<ReturnType<typeof mcpContainers>> | undefined;
        let connection: Awaited<ReturnType<typeof connectBrowser>> | undefined;
        try {
            stack = await mcpContainers(
                { edge: edge!, provider: baselineProvider!, repository: baselineRepository! },
                publish,
            );
            connection = await connectBrowser(stack.cmsUrl, stack.administrator);
            expect(connection.tools).toHaveLength(60);
            const pages = await connection.call("ulvia.cms.content", "pages.list", { limit: 100 });
            expect(pages.items.length).toBeGreaterThan(0);
            const snapshots = await Promise.all(
                pages.items.map((page: { id: string }) =>
                    connection!.call("ulvia.cms.content", "pages.get", { id: page.id }),
                ),
            );
            await stack.upgradeProvider(candidate!, "1.2.0");
            const catalogue = await connection.rpc("tools/list");
            connection.tools.splice(0, connection.tools.length, ...catalogue.tools);
            expect(connection.tools).toHaveLength(63);
            expect(await connection.call("ulvia.cms.content", "pages.list", { limit: 100 })).toEqual(pages);
            expect(
                await Promise.all(
                    pages.items.map((page: { id: string }) =>
                        connection!.call("ulvia.cms.content", "pages.get", { id: page.id }),
                    ),
                ),
            ).toEqual(snapshots);
            const query = await connection.call("ulvia.cms.observability", "logs.query", { limit: 5 });
            expect(query.items).toBeArray();
            const aggregate = await connection.call("ulvia.cms.observability", "logs.aggregate", { groupBy: "level" });
            expect(aggregate).toBeObject();
            await stack.restartProvider();
            expect(await connection.call("ulvia.cms.content", "pages.list", { limit: 100 })).toEqual(pages);
        } catch (error) {
            throw new Error(`${String(error)}\n${await stack?.diagnostics()}`);
        } finally {
            await connection?.browser.close();
            await stack?.close();
            await rm(directory, { recursive: true, force: true });
        }
    },
    360_000,
);
