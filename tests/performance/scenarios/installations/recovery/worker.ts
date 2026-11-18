import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { docker } from "../../../../integration/instance/docker";
import { responseBytes } from "../../../harness/transport/http";
import { ClientFailure } from "../../../harness/clients/failure";
import { recoveryWorkerConfiguration, RECOVERY_WORKER_LIMITS } from "./workerConfiguration";

/** Heavy fixture composition has its own cgroup and is removed before target measurement starts. */
export async function runRecoveryWorker(stack: Readonly<{ id: string; providerName: string }>, program: string) {
    if (
        !/^ulvia-mcp-[a-f0-9]{8}$/u.test(stack.id) ||
        stack.providerName !== `${stack.id}-provider` ||
        Buffer.byteLength(program) > 96 * 1024
    ) {
        throw new ClientFailure("recovery-worker-scope-refused");
    }
    const inspected = JSON.parse((await docker(["inspect", stack.providerName])).stdout);
    const config = recoveryWorkerConfiguration(stack, inspected);
    const directory = await mkdtemp(join(tmpdir(), `${stack.id}-recovery-worker-`));
    const name = `${stack.id}-upgrade-seed-${crypto.randomUUID().slice(0, 8)}`;
    try {
        const file = join(directory, "runtime.env");
        await writeFile(file, config.env, { mode: 0o600 });
        const child = Bun.spawn(
            [
                "docker",
                "run",
                "--rm",
                "--name",
                name,
                "--network",
                stack.id,
                "--volumes-from",
                stack.providerName,
                "--read-only",
                "--cap-drop",
                "ALL",
                "--security-opt",
                "no-new-privileges:true",
                "--tmpfs",
                "/tmp:rw,nosuid,nodev,noexec,size=128m",
                "--cpus",
                String(RECOVERY_WORKER_LIMITS.cpus),
                "--memory",
                String(RECOVERY_WORKER_LIMITS.memoryBytes),
                "--memory-swap",
                String(RECOVERY_WORKER_LIMITS.memoryBytes),
                "--env-file",
                file,
                "--workdir",
                "/app/packages/runtimes/ulvia-provider-server",
                "--entrypoint",
                "bun",
                config.image,
                "--no-macros",
                "-e",
                program,
            ],
            { stdout: "pipe", stderr: "pipe" },
        );
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            child.kill("SIGKILL");
        }, 60_000);
        try {
            const [code, stdout] = await Promise.all([
                child.exited,
                responseBytes(new Response(child.stdout), 64 * 1024),
                responseBytes(new Response(child.stderr), 64 * 1024),
            ]);
            if (timedOut || code !== 0) {
                throw new ClientFailure(timedOut ? "recovery-worker-timeout" : "recovery-worker-failed");
            }
            return new TextDecoder().decode(stdout);
        } finally {
            clearTimeout(timer);
            child.kill("SIGKILL");
            await child.exited;
        }
    } finally {
        try {
            await docker(["rm", "--force", name], true);
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    }
}
