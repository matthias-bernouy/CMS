import { randomBytes } from "node:crypto";
import { containerCluster } from "./cluster";
import { docker, waitForHttp } from "../docker";
import { configureRepository } from "../repository/initializationClient";
import { provisionInstance } from "../provision";
import { scratchSite } from "./scratchSite";

/** Start the first Repository before any public Repository or collection exists. */
export async function scratchRepository(images: { provider: string; edge: string }) {
    const cluster = await containerCluster(images.edge);
    const { id, run } = cluster;
    const operatorToken = randomBytes(32).toString("base64url");
    const administrator = {
        email: "scratch@example.test",
        password: `Admin-${randomBytes(24).toString("base64url")}!`,
    };
    const providerName = `${id}-provider`;
    const edgeName = `${id}-repository`;
    try {
        const mongo = `${id}-mongo`;
        await run(mongo, "mongo", "mongo:7");
        let ready = false;
        for (let attempt = 0; attempt < 100; attempt++) {
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
        await run(providerName, "ulvia-provider", images.provider, [
            "--publish",
            "127.0.0.1::5103",
            "--env",
            "MONGO_URL=mongodb://mongo:27017/scratch_control?retryWrites=false",
            "--volume",
            "/var/lib/cms/files",
            "--env",
            `CMS_SESSION_SECRET=${randomBytes(32).toString("base64url")}`,
            "--env",
            "CMS_KEK_ACTIVE_ID=control",
            "--env",
            `CMS_KEK_RING_JSON=${JSON.stringify({ control: randomBytes(32).toString("hex") })}`,
            "--env",
            "ULVIA_PROVIDER_PUBLIC_URL=http://ulvia-provider:5103",
            "--env",
            `ULVIA_PROVIDER_OPERATOR_TOKEN=${operatorToken}`,
        ]);
        const providerUrl = await cluster.endpoint(providerName, 5103);
        const waitForProvider = () =>
            waitForHttp(`${providerUrl}/ulvia/operator/instances`, { Authorization: `Bearer ${operatorToken}` });
        await waitForProvider();
        const reservation = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response(null) });
        const port = reservation.port!;
        reservation.stop(true);
        const url = `http://127.0.0.1:${port}`;
        // The repository hostname does not exist yet: provisioning cannot rely on its API.
        const instance = await provisionInstance(
            providerUrl,
            operatorToken,
            id,
            url,
            administrator,
            "http://repository:3000",
        );
        await run(edgeName, "repository", images.edge, [
            "--publish",
            `127.0.0.1:${port}:3000`,
            "--env",
            `CMS_PUBLIC_URL=${url}`,
            "--env",
            "CMS_INSTALLATIONS_PROVIDER_URL=http://ulvia-provider:5103",
            "--env",
            `CMS_INSTALLATIONS_PROVIDER_TOKEN=${instance.credentials.instanceAccessToken}`,
        ]);
        await waitForHttp(`${url}/readyz`);
        await configureRepository(url, administrator, url, true);
        return {
            url,
            administrator,
            providerName,
            edgeName,
            createSite: (alias: string) =>
                scratchSite(cluster, images.edge, providerUrl, operatorToken, administrator, alias),
            close: () => cluster.close(),
            async probeProvider() {
                const started = performance.now();
                const response = await fetch(`${providerUrl}/ulvia/operator/instances`, {
                    headers: { Authorization: `Bearer ${operatorToken}` },
                    signal: AbortSignal.timeout(5_000),
                });
                await response.body?.cancel();
                return { status: response.status, durationMs: performance.now() - started };
            },
            async restart() {
                await docker(["restart", providerName]);
                await waitForProvider();
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
        await cluster.close();
        throw error;
    }
}
