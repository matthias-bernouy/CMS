import { expect, test } from "bun:test";
import { docker, mcpContainers } from "../containers";
import { repositoryApi } from "./client";

const baseline = process.env.ULVIA_UPGRADE_BASELINE_PROVIDER_IMAGE;
const candidate = process.env.ULVIA_MCP_PROVIDER_DOCKER_IMAGE;
const edge = process.env.ULVIA_MCP_EDGE_DOCKER_IMAGE;
const integration = baseline && candidate && edge ? test : test.skip;

integration(
    "an installed site survives image replacement without a Repository or initialization kit",
    async () => {
        const stack = await mcpContainers({ provider: baseline!, edge: edge! });
        try {
            const api = repositoryApi(stack.cmsUrl);
            const session = await api.session(stack.administrator.email, stack.administrator.password);
            const pages = () => api.request("ulvia/cms.content", "/pages/list", "QUERY", { limit: 25 }, session);
            const before = await pages();
            expect(before.status).toBe(200);
            const snapshot = await before.json();
            expect(snapshot.items.length).toBeGreaterThan(0);
            await docker(["stop", stack.repository.name]);
            await stack.upgradeProvider(candidate!, "1.0.0");
            const after = await pages();
            expect(after.status).toBe(200);
            expect(await after.json()).toEqual(snapshot);
            expect((await fetch(`${stack.cmsUrl}/admin`, { headers: { cookie: session.cookie } })).status).toBe(200);
            await stack.restartProvider();
            expect((await pages()).status).toBe(200);
            // This candidate is deliberately built without the installation snapshot.
            expect(
                (
                    await docker(
                        [
                            "exec",
                            stack.providerName,
                            "test",
                            "-d",
                            "/app/packages/runtimes/ulvia-provider-server/dist/bootstrap",
                        ],
                        true,
                    )
                ).code,
            ).not.toBe(0);
        } catch (error) {
            throw new Error(`${String(error)}\n${await stack.diagnostics()}`);
        } finally {
            await stack.close();
        }
    },
    360_000,
);
