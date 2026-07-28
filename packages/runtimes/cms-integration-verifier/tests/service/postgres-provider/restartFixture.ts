import { POSTGRES_IMAGE } from "../postgresFixture";

export async function replaceDisposablePostgresContainer(
    publishedPort: number,
    password: string,
): Promise<{ container: string; port: number }> {
    const previous = containerPublishing(publishedPort);
    const name = containerName(previous);
    const stopped = Bun.spawnSync({ cmd: ["docker", "stop", "--time", "1", previous], stdout: "ignore" });
    if (stopped.exitCode !== 0) {
        throw new Error("Disposable PostgreSQL container could not be stopped");
    }
    await waitForContainerRemoval(previous);
    const container = replacePostgresContainer(name, password);
    return { container, port: mappedPort(container) };
}

function replacePostgresContainer(name: string, password: string): string {
    const result = Bun.spawnSync({
        cmd: [
            "docker",
            "run",
            "--detach",
            "--rm",
            "--name",
            name,
            "--read-only",
            "--user",
            "70:70",
            "--cap-drop",
            "ALL",
            "--security-opt",
            "no-new-privileges:true",
            "--pids-limit",
            "128",
            "--memory",
            "1g",
            "--cpus",
            "2.0",
            "--tmpfs",
            "/var/lib/postgresql/data:rw,nosuid,nodev,noexec,size=1g,mode=0700,uid=70,gid=70",
            "--tmpfs",
            "/var/run/postgresql:rw,nosuid,nodev,noexec,size=16m,mode=0770,uid=70,gid=70",
            "--tmpfs",
            "/tmp:rw,nosuid,nodev,noexec,size=64m,mode=0700,uid=70,gid=70",
            "--publish",
            "127.0.0.1::5432",
            "--env",
            "POSTGRES_USER=postgres",
            "--env",
            "POSTGRES_DB=postgres",
            "--env",
            `POSTGRES_PASSWORD=${password}`,
            POSTGRES_IMAGE,
        ],
        stdout: "pipe",
        stderr: "pipe",
    });
    const container = result.stdout.toString().trim();
    if (result.exitCode !== 0 || !container) {
        throw new Error(`Replacement disposable PostgreSQL could not start: ${result.stderr.toString().trim()}`);
    }
    return container;
}

async function waitForContainerRemoval(container: string): Promise<void> {
    for (let attempt = 0; attempt < 100; attempt += 1) {
        if (
            Bun.spawnSync({ cmd: ["docker", "inspect", container], stdout: "ignore", stderr: "ignore" }).exitCode !== 0
        ) {
            return;
        }
        await Bun.sleep(50);
    }
    throw new Error("Disposable PostgreSQL container was not removed after shutdown");
}

function mappedPort(container: string): number {
    const result = Bun.spawnSync({ cmd: ["docker", "port", container, "5432/tcp"], stdout: "pipe" });
    const match = result.stdout
        .toString()
        .trim()
        .match(/:(\d+)$/u);
    if (!match) {
        throw new Error("Restarted disposable PostgreSQL port was not published");
    }
    return Number(match[1]);
}

function containerName(container: string): string {
    const result = Bun.spawnSync({ cmd: ["docker", "inspect", "--format", "{{.Name}}", container], stdout: "pipe" });
    const name = result.stdout.toString().trim().replace(/^\//u, "");
    if (!name) {
        throw new Error("Disposable PostgreSQL container name could not be resolved");
    }
    return name;
}

function containerPublishing(port: number): string {
    const result = Bun.spawnSync({ cmd: ["docker", "ps", "--format", "{{.ID}} {{.Ports}}"], stdout: "pipe" });
    const line = result.stdout
        .toString()
        .split("\n")
        .find((entry) => entry.includes(`127.0.0.1:${port}->5432/tcp`));
    const container = line?.split(" ")[0];
    if (!container) {
        throw new Error("Disposable PostgreSQL container could not be resolved by its published port");
    }
    return container;
}
