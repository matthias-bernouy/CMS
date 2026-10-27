import { mkdtemp, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function docker(args: string[], allowFailure = false) {
    const child = Bun.spawn(["docker", ...args], { stdout: "pipe", stderr: "pipe" });
    const [code, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
    ]);
    if (code && !allowFailure) {
        throw new Error(`Docker ${args[0]} failed: ${stderr}`);
    }
    return { code, stdout, stderr };
}

export async function repositoryContainer(image: string) {
    const root = await mkdtemp(join(tmpdir(), "repository-docker-"));
    const name = `ulvia-repository-test-${randomUUID().slice(0, 8)}`;
    const competitor = `${name}-competitor`;
    const common = [
        "--init",
        "--user",
        `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`,
        "--read-only",
        "--tmpfs",
        "/tmp:rw,nosuid,nodev,noexec,size=64m",
        "--mount",
        `type=bind,source=${root},target=/var/lib/ulvia-repository`,
        "--env",
        "ULVIA_REPOSITORY_DIR=/var/lib/ulvia-repository",
        "--env",
        "ULVIA_REPOSITORY_SEED_DIR=",
        "--env",
        "REPOSITORY_PUBLIC_URL=https://repository.example",
    ];
    const start = () => docker(["run", "--detach", "--name", name, "--publish", "127.0.0.1::3000", ...common, image]);
    return {
        name,
        root,
        start,
        async ready() {
            const base = `http://${(await docker(["port", name, "3000/tcp"])).stdout.trim()}/`;
            for (let attempt = 0; attempt < 100; attempt++) {
                const response = await fetch(`${base}readyz`, { signal: AbortSignal.timeout(1_000) }).catch(() => null);
                await response?.body?.cancel();
                if (response?.ok) {
                    return base;
                }
                await Bun.sleep(100);
            }
            const logs = await docker(["logs", "--tail", "20", name], true);
            throw new Error(`Repository did not become ready: ${logs.stdout}${logs.stderr}`);
        },
        async contend() {
            await docker(["run", "--detach", "--name", competitor, ...common, image]);
            const result = await docker(["wait", competitor]);
            return Number(result.stdout.trim());
        },
        async close() {
            await docker(["rm", "--force", competitor, name], true);
            await rm(root, { recursive: true, force: true });
        },
    };
}
