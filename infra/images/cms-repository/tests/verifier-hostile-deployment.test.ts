import { expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const dockerfile = readFileSync(resolve(import.meta.dir, "../Verifier.Dockerfile"), "utf8");
const runtimeBase = dockerfile.match(/^FROM\s+(\S+)\s+AS\s+runtime$/mu)?.[1];
const dockerAvailable = command(["docker", "version"]);
const baseAvailable = runtimeBase ? command(["docker", "image", "inspect", runtimeBase]) : false;
const dockerSmoke = dockerAvailable && baseAvailable ? test : test.skip;

dockerSmoke(
    "a hostile sandbox cannot inspect supervisor processes or reach the repository result endpoint",
    async () => {
        if (!runtimeBase) {
            throw new Error("Verifier runtime base was not found");
        }
        const suffix = `${process.pid}-${randomBytes(4).toString("hex")}`;
        const repositoryNetwork = `cms-verifier-repository-${suffix}`;
        const sandboxNetwork = `cms-verifier-sandbox-${suffix}`;
        const repository = `cms-verifier-result-${suffix}`;
        const secret = `worker-secret-${randomBytes(24).toString("base64url")}`;
        try {
            createInternalNetwork(repositoryNetwork);
            createInternalNetwork(sandboxNetwork);
            const started = run([
                "docker",
                "run",
                "--detach",
                "--rm",
                "--name",
                repository,
                "--network",
                repositoryNetwork,
                "--env",
                `CMS_REPOSITORY_WORKER_TOKEN=${secret}`,
                runtimeBase,
                "bun",
                "-e",
                repositoryProgram,
            ]);
            expect(started.exitCode, started.stderr.toString()).toBe(0);
            const address = inspectAddress(repository);
            const probe = run([
                "docker",
                "run",
                "--rm",
                "--read-only",
                "--user",
                "1002:1002",
                "--network",
                sandboxNetwork,
                "--cap-drop",
                "ALL",
                "--security-opt",
                "no-new-privileges:true",
                "--pids-limit",
                "32",
                "--memory",
                "128m",
                "--cpus",
                "0.5",
                runtimeBase,
                "bun",
                "-e",
                hostileProbe,
                address,
            ]);
            expect(probe.exitCode, probe.stderr.toString()).toBe(0);
            expect(probe.stdout.toString().trim()).toBe("isolated");
        } finally {
            run(["docker", "rm", "--force", repository]);
            run(["docker", "network", "rm", repositoryNetwork]);
            run(["docker", "network", "rm", sandboxNetwork]);
        }
    },
    30_000,
);

const repositoryProgram = `
Bun.serve({
    port: 3000,
    hostname: "0.0.0.0",
    fetch() {
        return Response.json({ reached: true });
    },
});
await new Promise(() => undefined);
`;

const hostileProbe = `
const [address] = process.argv.slice(1);
const entries = await Array.fromAsync(new Bun.Glob("[0-9]*/environ").scan({ cwd: "/proc", absolute: true }));
for (const entry of entries) {
    const environment = await Bun.file(entry).text().catch(() => "");
    if (environment.includes("CMS_REPOSITORY_WORKER_TOKEN=")) process.exit(20);
}
if (await Bun.file("/var/run/docker.sock").exists()) process.exit(21);
try {
    const response = await fetch(
        "http://" + address + ":3000/.cms/repository-management/api/integrations/verification-jobs/result",
        { signal: AbortSignal.timeout(1000) },
    );
    await response.body?.cancel();
    process.exit(22);
} catch {
    process.stdout.write("isolated\\n");
}
`;

function createInternalNetwork(name: string): void {
    const result = run(["docker", "network", "create", "--internal", name]);
    expect(result.exitCode, result.stderr.toString()).toBe(0);
}

function inspectAddress(container: string): string {
    const result = run([
        "docker",
        "inspect",
        "--format",
        "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}",
        container,
    ]);
    expect(result.exitCode, result.stderr.toString()).toBe(0);
    const address = result.stdout.toString().trim();
    expect(address).toMatch(/^[0-9.]+$/u);
    return address;
}

function command(arguments_: string[]): boolean {
    return run(arguments_).exitCode === 0;
}

function run(arguments_: string[]) {
    return Bun.spawnSync({ cmd: arguments_, stdout: "pipe", stderr: "pipe" });
}
