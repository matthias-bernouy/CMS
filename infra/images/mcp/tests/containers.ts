import { provisionInstance } from "./provision";
import { randomBytes, randomUUID } from "node:crypto";

export async function docker(args: string[], allowFailure = false) {
    const child = Bun.spawn(["docker", ...args], { stdout: "pipe", stderr: "pipe" });
    const [code, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
    ]);
    if (code && !allowFailure) {
        throw new Error(`Docker ${args[0]} failed: ${stderr.slice(-3000)}`);
    }
    return { code, stdout, stderr };
}

async function mappedPort(name: string, port: number) {
    return `http://${(await docker(["port", name, `${port}/tcp`])).stdout.trim()}`;
}
export async function waitForHttp(url: string, headers: Record<string, string> = {}) {
    for (let attempt = 0; attempt < 150; attempt += 1) {
        const response = await fetch(url, { headers, signal: AbortSignal.timeout(1000) }).catch(() => null);
        await response?.body?.cancel();
        if (response?.ok) {
            return;
        }
        await Bun.sleep(200);
    }
    throw new Error(`Container did not become ready: ${url}`);
}

export async function mcpContainers(images: { kernel: string; provider: string; repository: string }) {
    const id = `ulvia-mcp-${randomUUID().slice(0, 8)}`;
    const names: string[] = [];
    const operatorToken = randomBytes(32).toString("base64url");
    const administrator = { email: "mcp-admin@ulvia.local", password: `Mcp-${randomBytes(24).toString("base64url")}!` };
    const reservation = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response(null) });
    const kernelPort = reservation.port!;
    reservation.stop(true);
    const kernelUrl = `http://127.0.0.1:${kernelPort}`;
    const providerName = `${id}-provider`;
    const kernelName = `${id}-kernel`;
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
            image,
            ...args,
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
        await run(providerName, "ulvia-provider", images.provider, [
            "--publish",
            "127.0.0.1::5103",
            "--env",
            "MONGO_URL=mongodb://mongo:27017/mcp_provider_control?retryWrites=false",
            "--env",
            "CMS_FILES_DIR=/var/lib/cms/files",
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
        const instance = await provisionInstance(providerUrl, operatorToken, id, kernelUrl, administrator);
        const named = await provisionInstance(
            providerUrl,
            operatorToken,
            `${id}-named`,
            `http://preview.localhost:${kernelPort}`,
            administrator,
        );
        await run(kernelName, "kernel", images.kernel, [
            "--publish",
            `127.0.0.1:${kernelPort}:3000`,
            "--env",
            `KERNEL_PUBLIC_URL=${kernelUrl}`,
            "--env",
            "CMS_INSTALLATIONS_PROVIDER_URL=http://ulvia-provider:5103",
            "--env",
            `CMS_INSTALLATIONS_PROVIDER_TOKEN=${instance.credentials.instanceAccessToken}`,
        ]);
        await waitForHttp(`${kernelUrl}/readyz`);
        return {
            id,
            namedStatus: named.instance.status,
            kernelUrl,
            repositoryUrl,
            administrator,
            providerName,
            kernelName,
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
                        [providerName, kernelName].map(async (name) => {
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
