import { exerciseDelegationStore } from "./providers/delegation";
import { exerciseProviders } from "./providers/flow";
import { expect, test } from "bun:test";
import { exerciseObservability, verifyObservabilityPersistence } from "./observability";
import { docker, mcpContainers } from "./containers";
import { connectBrowser } from "./oauth";
import { exerciseCollections, exerciseContent, exerciseFiles } from "./collections";

const images = {
    kernel: process.env.ULVIA_MCP_KERNEL_DOCKER_IMAGE,
    provider: process.env.ULVIA_MCP_PROVIDER_DOCKER_IMAGE,
    repository: process.env.ULVIA_REPOSITORY_DOCKER_IMAGE,
};
const integration = Object.values(images).every(Boolean) ? test : test.skip;

integration(
    "real CMS owns MCP V1, authorizes a browser client, publishes collections and files, and persists revocation",
    async () => {
        const f = await mcpContainers(images as Record<keyof typeof images, string>);
        let connection: Awaited<ReturnType<typeof connectBrowser>> | undefined;
        try {
            expect((await fetch(`${f.repositoryUrl}/mcp`, { method: "POST", body: "{}" })).status).toBe(404);
            expect((await fetch(`${f.kernelUrl}/.cms/mcp`, { method: "POST", body: "{}" })).status).toBe(401);
            expect(f.namedStatus).toBe("ready");
            await docker([
                "exec",
                f.providerName,
                "bun",
                "--no-macros",
                "run",
                "packages/runtimes/ulvia-provider-server/src/checkRetention.ts",
            ]);
            connection = await connectBrowser(f.kernelUrl, f.administrator);
            expect(connection.tools).toHaveLength(60);
            await exerciseDelegationStore(f.providerName, f.id);
            await exerciseProviders(f, connection.page);
            const namespace = f.id.replaceAll("-", "");
            const publicKey = await exerciseCollections(connection.call, namespace, f.providerName);
            const namespaces = await connection.call("ulvia.cms.repository", "list-namespaces");
            expect(namespaces.items).toContainEqual(expect.objectContaining({ namespace, access: "owned" }));
            expect((await connection.call("ulvia.cms.repository", "track-namespace", { namespace })).access).toBe(
                "owned",
            );
            await exerciseContent(connection.call, f.kernelUrl);
            await exerciseFiles(connection.call, f.kernelUrl, connection.token.access_token);
            const logId = await exerciseObservability(await f.providerUrl(), f.instanceToken, f.namedToken);
            await f.restartProvider();
            await verifyObservabilityPersistence(await f.providerUrl(), f.instanceToken, logId);
            expect((await connection.call("ulvia.cms.repository", "get-identity")).publicKey).toBe(publicKey);
            expect((await connection.call("ulvia.cms.repository", "list-namespaces")).items).toContainEqual(
                expect.objectContaining({ namespace, access: "owned" }),
            );
            await connection.revoke();
            await f.restartProvider();
            expect(
                (
                    await fetch(`${f.kernelUrl}/.cms/mcp`, {
                        method: "POST",
                        headers: { Authorization: `Bearer ${connection.token.access_token}` },
                        body: "{}",
                    })
                ).status,
            ).toBe(401);
            const registrations = await Promise.all(
                Array.from({ length: 96 }, () =>
                    fetch(`${f.kernelUrl}/.cms/oauth/register`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ redirect_uris: ["https://client.example/callback"] }),
                    }).then(async (response) => {
                        const { error } = await response.json();
                        return { status: response.status, error };
                    }),
                ),
            );
            expect(
                registrations.map((item) => item.status),
                JSON.stringify(registrations),
            ).toContain(429);
            expect(registrations.every(({ status }) => status === 201 || status === 429)).toBe(true);
        } catch (error) {
            throw new Error(`${String(error)}\n${await f.diagnostics()}`);
        } finally {
            await connection?.browser.close();
            await f.close();
        }
    },
    360_000,
);
