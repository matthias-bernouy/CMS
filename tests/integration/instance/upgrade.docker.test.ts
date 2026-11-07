import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runCli } from "../../../packages/runtimes/ulvia-cli/src/cli";
import { HttpProviderRepository } from "@bernouy/cms-repository/providers/http";
import { mcpContainers, waitForHttp } from "./containers";
import { connectBrowser } from "./oauth";
import { repositoryApi } from "./repository/client";

const baselineProvider = process.env.ULVIA_UPGRADE_BASELINE_PROVIDER_IMAGE;
const candidate = process.env.ULVIA_MCP_PROVIDER_DOCKER_IMAGE;
const edge = process.env.ULVIA_MCP_EDGE_DOCKER_IMAGE;
const integration = baselineProvider && candidate && edge ? test : test.skip;

integration(
    "Provider image replacement preserves CMS Pages, Registry ownership and publications, and MCP grants",
    async () => {
        const directory = await mkdtemp(join(tmpdir(), "ulvia-provider-upgrade-"));
        const publish = async (url: string, token: string) => {
            const options = {
                environment: {
                    ULVIA_DATA_DIR: directory,
                    ULVIA_CONFIG_DIR: join(directory, "config"),
                    ULVIA_REPOSITORY_TOKEN: token,
                },
                log: () => undefined,
            };
            const cli = (args: string[]) => runCli(args, options);
            await cli(["repository", "login", url]);
            await cli(["namespace", "claim", "ulvia"]);
            await cli(["release", resolve(import.meta.dir, "../../../packages/official-repository"), "--recursive"]);
            await cli(["push", "all", "--repository", url]);
        };
        let stack: Awaited<ReturnType<typeof mcpContainers>> | undefined;
        let connection: Awaited<ReturnType<typeof connectBrowser>> | undefined;
        try {
            stack = await mcpContainers(
                { edge: edge!, provider: baselineProvider! },
                publish,
                undefined,
                undefined,
                true,
            );
            connection = await connectBrowser(stack.cmsUrl, stack.administrator);
            expect(connection.tools.length).toBeGreaterThan(0);
            const initialToolCount = connection.tools.length;
            const pages = await connection.call("ulvia/cms.content", "pages.list", { limit: 100 });
            expect(pages.items.length).toBeGreaterThan(0);
            const snapshots = await Promise.all(
                pages.items.map((page: { id: string }) =>
                    connection!.call("ulvia/cms.content", "pages.get", { id: page.id }),
                ),
            );
            const registry = repositoryApi(stack.repositoryUrl);
            const identity = await (await registry.request("ulvia/repository", "/v1/info")).json();
            const inventory = () =>
                registry.request("ulvia/repository", "/v1/namespaces", "GET", undefined, stack!.repository.pat);
            const beforeInventory = await inventory();
            expect(beforeInventory.status).toBe(200);
            const owned = await beforeInventory.json();
            const publicSource = new HttpProviderRepository("upgrade", stack.repositoryUrl);
            const published = await publicSource.list("contract");
            expect(published.length).toBeGreaterThan(0);
            const bytes = await publicSource.get(published[0]!);
            const admin = await registry.session(
                stack.repository.administrator.email,
                stack.repository.administrator.password,
            );
            const registryPages = await (
                await registry.request("ulvia/cms.content", "/pages/list", "QUERY", { limit: 100 }, admin)
            ).json();
            const pageId = registryPages.items.find(({ path }: { path: string }) => path === "/").id;
            const original = await (
                await registry.request("ulvia/cms.content", "/pages/get", "QUERY", { id: pageId }, admin)
            ).json();
            expect(
                (
                    await registry.request(
                        "ulvia/cms.content",
                        "/pages/update",
                        "POST",
                        { id: pageId, expectedRevision: original.revision, title: "Retained across image replacement" },
                        admin,
                    )
                ).status,
            ).toBe(200);
            await stack.upgradeProvider(candidate!, "1.0.0");
            await waitForHttp(`${stack.repositoryUrl}/.cms/call/ulvia/repository/v1/info`);
            expect(await (await registry.request("ulvia/repository", "/v1/info")).json()).toEqual(identity);
            const retained = await inventory();
            expect(retained.status).toBe(200);
            expect(await retained.json()).toEqual(owned);
            expect(await publicSource.list("contract")).toEqual(published);
            expect(await publicSource.get(published[0]!)).toEqual(bytes);
            expect(
                await (
                    await registry.request("ulvia/cms.content", "/pages/get", "QUERY", { id: pageId }, admin)
                ).json(),
            ).toMatchObject({ title: "Retained across image replacement", content: original.content });
            await connection.refreshTools();
            expect(connection.tools).toHaveLength(initialToolCount);
            expect(await connection.call("ulvia/cms.content", "pages.list", { limit: 100 })).toEqual(pages);
            expect(
                await Promise.all(
                    pages.items.map((page: { id: string }) =>
                        connection!.call("ulvia/cms.content", "pages.get", { id: page.id }),
                    ),
                ),
            ).toEqual(snapshots);
            const query = await connection.call("ulvia/cms.observability", "logs.query", { limit: 5 });
            expect(query.items).toBeArray();
            const aggregate = await connection.call("ulvia/cms.observability", "logs.aggregate", { groupBy: "level" });
            expect(aggregate).toBeObject();
            await stack.restartProvider();
            expect(await connection.call("ulvia/cms.content", "pages.list", { limit: 100 })).toEqual(pages);
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
