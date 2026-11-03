import { expect, test } from "bun:test";
import { docker, mcpContainers, waitForHttp } from "../../integration/instance/containers";
import { repositoryApi } from "../../integration/instance/repository/client";
import { exercisePublication } from "../../integration/instance/repository/publication/scenario";
import { publicDownload } from "../../integration/instance/repository/publication/assets";

const images = { edge: process.env.ULVIA_MCP_EDGE_DOCKER_IMAGE, provider: process.env.ULVIA_MCP_PROVIDER_DOCKER_IMAGE };

test.skipIf(!images.edge || !images.provider)(
    "real CMS images enforce account ownership and retain publications through graceful and abrupt restarts",
    async () => {
        const f = await mcpContainers(images as Record<keyof typeof images, string>);
        try {
            const api = repositoryApi(f.repositoryUrl);
            const a = await api.signup("a@example.test", "Repository-a-long-password");
            const b = await api.signup("b@example.test", "Repository-b-long-password");
            expect(a.administrator).toBe(false);
            expect(b.administrator).toBe(false);
            const token = await api.pat(a.cookie);
            expect(
                (
                    await api.request(
                        "ulvia.repository",
                        "/v1/namespace-actions/claim",
                        "POST",
                        { namespace: "journey.a" },
                        token,
                    )
                ).status,
            ).toBe(200);
            const publication = await exercisePublication(api, f.repositoryUrl, token, b);
            const identity = await (await api.request("ulvia.repository", "/v1/info")).json();
            for (const path of ["/v1/info", "/v1/namespaces/claim", "/v1/releases/contract/a/b/1.0.0"]) {
                const response = await fetch(`${f.repositoryUrl}${path}`);
                expect(response.status).toBe(404);
                await response.body?.cancel();
            }
            for (const name of [f.providerName, f.repository.name]) {
                const routes = await docker(["exec", name, "bun", "-e", `(${networkRoutes.toString()})()`]);
                const network = JSON.parse(routes.stdout);
                expect(network.rows).toBeGreaterThan(0);
                expect(network.hasDefaultRoute).toBe(false);
            }
            for (const signal of ["TERM", "KILL"]) {
                for (const name of [f.repository.name, f.providerName]) {
                    await docker(["kill", `--signal=${signal}`, name]);
                    const exitCode = (await docker(["wait", name])).stdout.trim();
                    console.info("Repository image process outcome", {
                        component: name === f.providerName ? "provider" : "edge",
                        signal,
                        exitCode,
                    });
                    expect(exitCode).toBe(signal === "TERM" ? "0" : "137");
                }
                await docker(["start", f.providerName]);
                await f.waitForProvider();
                await docker(["start", f.repository.name]);
                await waitForHttp(`${f.repositoryUrl}/readyz`);
                expect(await (await api.request("ulvia.repository", "/v1/info")).json()).toEqual(identity);
                const account = await api.session("b@example.test", "Repository-b-long-password");
                expect(account.accountId).toBe(b.accountId);
                const inventory = await api.request(
                    "ulvia.repository",
                    "/v1/namespaces",
                    "GET",
                    undefined,
                    publication.token,
                );
                expect(inventory.status).toBe(200);
                expect((await inventory.json()).namespaces).toContainEqual(
                    expect.objectContaining({ namespace: "journey.a", revision: 2 }),
                );
                await publicDownload(f.repositoryUrl, publication.sample);
            }
            const inspection = JSON.parse((await docker(["inspect", f.providerName])).stdout)[0];
            expect(inspection.Config.Cmd.join(" ")).toContain("ulvia-provider-server/src/index.ts");
            expect(inspection.HostConfig.ReadonlyRootfs).toBe(true);
        } catch (error) {
            throw new Error(`${String(error)}\n${await f.diagnostics()}`);
        } finally {
            await f.close();
        }
    },
    240_000,
);

async function networkRoutes() {
    const rows = (await Bun.file("/proc/net/route").text()).trim().split("\n").slice(1);
    console.log(
        JSON.stringify({
            rows: rows.length,
            hasDefaultRoute: rows.some((row) => row.trim().split(/\s+/)[1] === "00000000"),
        }),
    );
}
