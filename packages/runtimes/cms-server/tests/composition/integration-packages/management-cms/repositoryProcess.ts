import { chmod, lstat, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const workspaceRoot = resolve(import.meta.dir, "../../../../../../..");
const repositoryEntrypoint = join(workspaceRoot, "packages/runtimes/cms-repository-server/src/index.ts");

export type RepositoryProcess = Readonly<{
    publicOrigin: string;
    managementOrigin: string;
    token: string;
    stop(): Promise<void>;
    dispose(): Promise<void>;
}>;

export async function startRepositoryProcess(): Promise<RepositoryProcess> {
    const root = await mkdtemp(join(tmpdir(), "cms-management-acceptance-"));
    const registryRoot = join(root, "registry");
    const tokenFile = join(root, "management-token");
    const token = `acceptance-token-${crypto.randomUUID()}`;
    await mkdir(registryRoot);
    await writeFile(tokenFile, token, { mode: 0o600 });
    const [publicPort, managementPort] = reserveDistinctPorts();
    const publicOrigin = `http://127.0.0.1:${publicPort}`;
    const managementOrigin = `http://127.0.0.1:${managementPort}`;
    const output: string[] = [];
    const child = Bun.spawn([process.execPath, "run", repositoryEntrypoint], {
        cwd: workspaceRoot,
        env: {
            ...process.env,
            CMS_REPOSITORY_PUBLIC_PORT: String(publicPort),
            CMS_REPOSITORY_MANAGEMENT_PORT: String(managementPort),
            CMS_REPOSITORY_REGISTRY_ROOT: registryRoot,
            CMS_REPOSITORY_MANAGEMENT_TOKEN_FILE: tokenFile,
            CMS_HTTP_CLIENT_ADDRESS_MODE: "disabled",
            CMS_HTTP_TRUSTED_PROXY_HOPS: "0",
            CMS_REPOSITORY_GRACEFUL_STOP_TIMEOUT_MS: "1000",
        },
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
    });
    void collectOutput(child.stdout, output);
    void collectOutput(child.stderr, output);
    try {
        await waitUntilHealthy(publicOrigin, child, output);
    } catch (error) {
        child.kill("SIGKILL");
        await child.exited;
        await rm(root, { force: true, recursive: true });
        throw error;
    }

    const stop = async () => {
        if (child.exitCode !== null) {
            return;
        }
        child.kill("SIGTERM");
        const exited = await Promise.race([child.exited, Bun.sleep(2_000).then(() => null)]);
        if (exited === null) {
            child.kill("SIGKILL");
            await child.exited;
        }
    };
    return {
        publicOrigin,
        managementOrigin,
        token,
        stop,
        async dispose() {
            await stop();
            await makeWritable(root);
            await rm(root, { force: true, recursive: true });
        },
    };
}

function reserveDistinctPorts(): [number, number] {
    const first = Bun.serve({ port: 0, fetch: () => new Response() });
    const second = Bun.serve({ port: 0, fetch: () => new Response() });
    const ports: [number, number] = [first.port, second.port];
    first.stop(true);
    second.stop(true);
    return ports;
}

async function waitUntilHealthy(origin: string, child: ReturnType<typeof Bun.spawn>, output: string[]): Promise<void> {
    for (let attempt = 0; attempt < 120; attempt++) {
        if (child.exitCode !== null) {
            throw new Error(`Repository process exited before readiness: ${output.join("\n")}`);
        }
        try {
            if ((await fetch(`${origin}/health`)).status === 200) {
                return;
            }
        } catch {
            // Listener startup is asynchronous across the process boundary.
        }
        await Bun.sleep(25);
    }
    throw new Error(`Repository process readiness timed out: ${output.join("\n")}`);
}

async function collectOutput(stream: ReadableStream<Uint8Array>, output: string[]): Promise<void> {
    const text = await new Response(stream).text();
    output.push(text);
}

async function makeWritable(path: string): Promise<void> {
    const metadata = await lstat(path);
    if (!metadata.isDirectory()) {
        return;
    }
    await chmod(path, 0o750);
    for (const entry of await readdir(path, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            await makeWritable(join(path, entry.name));
        }
    }
}
