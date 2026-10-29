import { provisionInstance } from "./provision";
import { randomBytes, randomUUID } from "node:crypto";

import { docker, mappedPort, waitForHttp } from "./docker";
import { upgradeProvider } from "./provider-upgrade";
export { docker, waitForHttp } from "./docker";

export async function mcpContainers(
    images: { edge: string; provider: string; repository: string },
    prepareRepository?: (url: string) => Promise<void>,
    fetchPreload?: string,
    initialResponseCache?: boolean,
) {
    const id = `ulvia-mcp-${randomUUID().slice(0, 8)}`;
    const names: string[] = [];
    const operatorToken = randomBytes(32).toString("base64url");
    const administrator = { email: "mcp-admin@ulvia.local", password: `Mcp-${randomBytes(24).toString("base64url")}!` };
    const reservation = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response(null) });
    const edgePort = reservation.port!;
    reservation.stop(true);
    const cmsUrl = `http://127.0.0.1:${edgePort}`;
    const providerName = `${id}-provider`;
    const edgeName = `${id}-edge`;
    await docker(["network", "create", id]);
    const run = async (name: string, alias: string, image: string, options: string[] = [], args: string[] = []) => {
        names.push(name);
        await docker([
            "run",
            "--detach",
            "--init",
            "--name",
            name,
            "--network",
            id,
            "--network-alias",
            alias,
            ...options,
            ...(fetchPreload ? ["--no-healthcheck"] : []),
            ...(fetchPreload && (alias === "edge" || alias === "ulvia-provider")
                ? ["--volume", `${fetchPreload}:/ulvia-test/fetch.ts:ro`]
                : []),
            image,
            ...(fetchPreload && (alias === "edge" || alias === "ulvia-provider")
                ? [
                      "bun",
                      "run",
                      "--no-macros",
                      "--preload=/ulvia-test/fetch.ts",
                      alias === "edge"
                          ? "packages/runtimes/cms-edge-server/src/index.ts"
                          : "packages/runtimes/ulvia-provider-server/src/index.ts",
                  ]
                : args),
        ]);
    };
    const close = async () => {
        await docker(["rm", "--force", "--volumes", ...names], true);
        await docker(["network", "rm", id], true);
    };
    try {
        const mongo = `${id}-mongo`;
        await run(mongo, "mongo", "mongo:7");
        let ready = false;
        for (let attempt = 0; attempt < 100; attempt += 1) {
            if (
                (await docker(["exec", mongo, "mongosh", "--quiet", "--eval", "db.runCommand({ping:1}).ok"], true))
                    .code === 0
            ) {
                ready = true;
                break;
            }
            await Bun.sleep(200);
        }
        if (!ready) {
            throw new Error("MongoDB did not become ready");
        }
        const repositoryName = `${id}-repository`;
        await run(repositoryName, "repository", images.repository, ["--publish", "127.0.0.1::3000"]);
        const repositoryUrl = await mappedPort(repositoryName, 3000);
        await waitForHttp(`${repositoryUrl}/readyz`);
        await prepareRepository?.(repositoryUrl);
        await run(providerName, "ulvia-provider", images.provider, [
            "--publish",
            "127.0.0.1::5103",
            "--env",
            "MONGO_URL=mongodb://mongo:27017/mcp_provider_control?retryWrites=false",
            "--env",
            "CMS_FILES_DIR=/var/lib/cms/files",
            "--volume",
            "/var/lib/cms/files",
            "--env",
            "CMS_REPOSITORY_URL=http://repository:3000",
            "--env",
            "CMS_REPOSITORY_ALLOW_INSECURE_HTTP=true",
            "--env",
            `CMS_SESSION_SECRET=${randomBytes(32).toString("base64url")}`,
            "--env",
            `CMS_KEK_HEX=${randomBytes(32).toString("hex")}`,
            "--env",
            "ULVIA_PROVIDER_PUBLIC_URL=http://ulvia-provider:5103",
            "--env",
            `ULVIA_PROVIDER_OPERATOR_TOKEN=${operatorToken}`,
        ]);
        const providerUrl = await mappedPort(providerName, 5103);
        await waitForHttp(`${providerUrl}/ulvia/operator/instances`, { Authorization: `Bearer ${operatorToken}` });
        const instance = await provisionInstance(
            providerUrl,
            operatorToken,
            id,
            cmsUrl,
            administrator,
            "http://edge:3000",
        );
        const named = await provisionInstance(
            providerUrl,
            operatorToken,
            `${id}-named`,
            `http://preview.localhost:${edgePort}`,
            administrator,
            "http://named-edge:3000",
        );
        const startEdge = async (cache = initialResponseCache) =>
            run(edgeName, "edge", images.edge, [
                "--publish",
                `127.0.0.1:${edgePort}:3000`,
                "--env",
                `CMS_PUBLIC_URL=${cmsUrl}`,
                "--env",
                "CMS_INSTALLATIONS_PROVIDER_URL=http://ulvia-provider:5103",
                "--env",
                `CMS_INSTALLATIONS_PROVIDER_TOKEN=${instance.credentials.instanceAccessToken}`,
                ...(cache === undefined ? [] : ["--env", `CMS_EDGE_RESPONSE_CACHE=${cache}`]),
            ]);
        await startEdge();
        await waitForHttp(`${cmsUrl}/readyz`);
        return {
            id,
            gatewayUrl: "http://edge:3000",
            namedStatus: named.instance.status,
            providerUrl: () => mappedPort(providerName, 5103),
            instanceToken: instance.credentials.instanceAccessToken,
            namedToken: named.credentials.instanceAccessToken,
            cmsUrl,
            repositoryUrl,
            administrator,
            providerName,
            instanceId: instance.instance.id,
            upgradeProvider: async (image: string, version: string) => {
                await upgradeProvider(providerName, image, version, operatorToken, instance.instance.id, names);
                // A changed control contract is negotiated when the stateless Edge starts.
                await docker(["restart", edgeName]);
                await waitForHttp(`${cmsUrl}/readyz`);
            },
            edgeName,
            async setResponseCache(enabled: boolean) {
                await docker(["rm", "--force", edgeName]);
                await startEdge(enabled);
                await waitForHttp(`${cmsUrl}/readyz`);
            },
            close,
            async restartProvider() {
                await docker(["restart", providerName]);
                await waitForHttp(`${await mappedPort(providerName, 5103)}/ulvia/operator/instances`, {
                    Authorization: `Bearer ${operatorToken}`,
                });
            },
            async diagnostics() {
                return (
                    await Promise.all(
                        [providerName, edgeName].map(async (name) => {
                            const result = await docker(["logs", "--tail", "30", name], true);
                            return `${name}\n${result.stdout}${result.stderr}`;
                        }),
                    )
                ).join("\n");
            },
        };
    } catch (error) {
        const logs = await Promise.all(
            names.map(async (name) => {
                const value = await docker(["logs", "--tail", "15", name], true);
                return `${name}\n${value.stdout}${value.stderr}`;
            }),
        );
        await close();
        throw new Error(`${String(error)}\n${logs.join("\n")}`);
    }
}
