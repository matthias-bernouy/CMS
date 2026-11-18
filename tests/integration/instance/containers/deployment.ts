import { randomBytes } from "node:crypto";
import { containerCluster } from "./cluster";
import type { ContainerResourceLimits, ContainerCluster } from "./cluster";
import { createContainerHosting } from "./hosting";
import { docker, waitForHttp } from "../docker";

export type DeploymentSetup = (cluster: ContainerCluster) => Promise<readonly string[]>;
type DeploymentStage = "mongo" | "provider" | "edge" | "control";

/** Diagnostic text stays private; ordinary error formatting and JSON expose only the fixed stage. */
export class DeploymentPreparationError extends Error {
    declare readonly diagnostics: string;
    constructor(
        readonly stage: DeploymentStage,
        diagnostics: string,
        cause: unknown,
    ) {
        super(`Disposable deployment preparation failed during ${stage}`, { cause });
        Object.defineProperty(this, "diagnostics", { value: diagnostics });
    }
}

/** One shared Edge and Provider, independent of a fixture's logical sites. */
export async function sharedDeployment(
    images: { edge: string; provider: string },
    fetchPreload?: string,
    initialResponseCache?: boolean,
    resources?: ContainerResourceLimits,
    prepareServices?: DeploymentSetup,
) {
    const cluster = await containerCluster(images.edge, fetchPreload, resources);
    const { id, names, run } = cluster;
    const operatorToken = randomBytes(32).toString("base64url");
    const administrator = { email: "mcp-admin@ulvia.local", password: `Mcp-${randomBytes(24).toString("base64url")}!` };
    const reservation = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response(null) });
    const edgePort = reservation.port!;
    reservation.stop(true);
    const cmsUrl = `http://site.localhost:${edgePort}`;
    const namedUrl = `http://preview.localhost:${edgePort}`;
    const hosting = await createContainerHosting(edgePort).catch(async (error) => {
        await cluster.close();
        throw error;
    });
    const close = async () => {
        try {
            await cluster.close();
        } finally {
            await hosting.close();
        }
    };
    const providerName = `${id}-provider`;
    const edgeName = `${id}-edge`;
    let stage: DeploymentStage = "mongo";
    try {
        const providerOptions = prepareServices ? await prepareServices(cluster) : [];
        const mongo = `${id}-mongo`;
        await run(
            mongo,
            "mongo",
            "mongo:7.0.37@sha256:d5b3ca8c3f3cdce78d44870dc0871b76d5235e9b2ad4ea6bea5d1fbff8027703",
            ["--ulimit", "nofile=65536:65536"],
        );
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
        stage = "provider";
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
            `CMS_SESSION_SECRET=${randomBytes(32).toString("base64url")}`,
            "--env",
            "CMS_KEK_ACTIVE_ID=control",
            "--env",
            `CMS_KEK_RING_JSON=${JSON.stringify({ control: randomBytes(32).toString("hex") })}`,
            "--env",
            "ULVIA_PROVIDER_PUBLIC_URL=http://ulvia-provider:5103",
            ...hosting.providerOptions,
            ...providerOptions,
            "--env",
            `ULVIA_PROVIDER_OPERATOR_TOKEN=${operatorToken}`,
        ]);
        const providerUrl = await cluster.endpoint(providerName, 5103);
        await waitForHttp(`${providerUrl}/readyz`);
        stage = "edge";
        const startEdge = async (cache = initialResponseCache) =>
            run(edgeName, "edge", images.edge, [
                "--publish",
                `127.0.0.1:${edgePort}:3000`,
                "--env",
                "CMS_HOSTING_PROVIDER_URL=http://ulvia-provider:5103",
                "--env",
                `CMS_HOSTING_EDGE_SECRET=${hosting.edgeSecret}`,
                ...(cache === undefined ? [] : ["--env", `CMS_EDGE_RESPONSE_CACHE=${cache}`]),
            ]);
        await startEdge();
        await waitForHttp(`${hosting.origin}/readyz`);
        stage = "control";
        await hosting.initialize();
        return {
            cluster,
            hosting,
            providerUrl,
            providerName,
            edgeName,
            cmsUrl,
            namedUrl,
            operatorToken,
            administrator,
            startEdge,
            close,
        };
    } catch (error) {
        const diagnostics = await Promise.allSettled(
            [`${id}-mongo`, providerName, edgeName].map(async (name) => {
                const output = await docker(["logs", "--tail", "20", name], true);
                return `${name}\n${output.stdout.slice(-6000)}${output.stderr.slice(-6000)}`;
            }),
        );
        await close();
        throw new DeploymentPreparationError(
            stage,
            diagnostics
                .map((row) => (row.status === "fulfilled" ? row.value : "Startup diagnostics unavailable"))
                .join("\n"),
            error,
        );
    }
}
