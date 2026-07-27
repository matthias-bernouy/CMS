import { SQL } from "bun";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { POSTGRES_DEDICATED_CLUSTER_CONTRACT } from "../../src/runtime/providers/postgres/fingerprint";

export const POSTGRES_IMAGE =
    "postgres:16-alpine@sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777";

export const disposablePostgresAvailable =
    command(["docker", "version"]) && command(["docker", "image", "inspect", POSTGRES_IMAGE]);

export type DisposablePostgresFixture = Readonly<{
    host: "127.0.0.1";
    port: number;
    password: string;
    passwordFile: string;
    executeAs(connectionUri: string, statement: string): Readonly<{ exitCode: number; stderr: string }>;
    close(): Promise<void>;
}>;

export async function startDisposablePostgres(): Promise<DisposablePostgresFixture> {
    const root = await mkdtemp(join(tmpdir(), "cms-verifier-provider-"));
    const password = `probe-${randomBytes(24).toString("base64url")}`;
    const passwordFile = join(root, "password");
    await writeFile(passwordFile, password, { mode: 0o400 });
    const container = `cms-verifier-provider-${process.pid}-${randomBytes(4).toString("hex")}`;
    const started = Bun.spawnSync({
        cmd: [
            "docker",
            "run",
            "--detach",
            "--rm",
            "--name",
            container,
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
    if (started.exitCode !== 0) {
        await rm(root, { recursive: true, force: true });
        throw new Error("Disposable PostgreSQL container could not start");
    }
    try {
        await waitForPostgres(container);
        const port = mappedPort(container);
        await waitForHostPostgres(port, password);
        return {
            host: "127.0.0.1",
            port,
            password,
            passwordFile,
            executeAs(connectionUri, statement) {
                const target = new URL(connectionUri);
                const result = Bun.spawnSync({
                    cmd: [
                        "docker",
                        "exec",
                        "--env",
                        `PGPASSWORD=${decodeURIComponent(target.password)}`,
                        container,
                        "psql",
                        "--no-psqlrc",
                        "--set",
                        "ON_ERROR_STOP=1",
                        "--username",
                        decodeURIComponent(target.username),
                        "--dbname",
                        target.pathname.slice(1),
                        "--command",
                        statement,
                    ],
                    stdout: "ignore",
                    stderr: "pipe",
                });
                return { exitCode: result.exitCode, stderr: result.stderr.toString() };
            },
            async close() {
                Bun.spawnSync({
                    cmd: ["docker", "stop", "--time", "1", container],
                    stdout: "ignore",
                    stderr: "ignore",
                });
                await rm(root, { recursive: true, force: true });
            },
        };
    } catch (error) {
        Bun.spawnSync({ cmd: ["docker", "stop", "--time", "1", container], stdout: "ignore", stderr: "ignore" });
        await rm(root, { recursive: true, force: true });
        throw error;
    }
}

export async function markDisposablePostgresDedicated(postgres: DisposablePostgresFixture): Promise<void> {
    const url = new URL("postgresql://postgres@localhost/postgres");
    url.hostname = postgres.host;
    url.port = String(postgres.port);
    url.password = postgres.password;
    url.searchParams.set("sslmode", "disable");
    const admin = new SQL(url.toString(), { max: 1 });
    try {
        await admin.unsafe(`comment on database postgres is '${POSTGRES_DEDICATED_CLUSTER_CONTRACT}'`);
    } finally {
        await admin.close();
    }
}

async function waitForPostgres(container: string): Promise<void> {
    for (let attempt = 0; attempt < 100; attempt += 1) {
        if (command(["docker", "exec", container, "pg_isready", "-U", "postgres", "-d", "postgres"])) {
            return;
        }
        await Bun.sleep(100);
    }
    throw new Error("Disposable PostgreSQL probe did not become ready");
}

async function waitForHostPostgres(port: number, password: string): Promise<void> {
    for (let attempt = 0; attempt < 100; attempt += 1) {
        const database = new SQL(`postgresql://postgres:${password}@127.0.0.1:${port}/postgres?sslmode=disable`, {
            max: 1,
        });
        try {
            await database.unsafe("select 1");
            await database.close();
            return;
        } catch {
            await database.close({ timeout: 0 }).catch(() => undefined);
            await Bun.sleep(100);
        }
    }
    throw new Error("Disposable PostgreSQL probe was not reachable from the host");
}

function mappedPort(container: string): number {
    const result = Bun.spawnSync({ cmd: ["docker", "port", container, "5432/tcp"], stdout: "pipe" });
    const match = result.stdout
        .toString()
        .trim()
        .match(/:(\d+)$/u);
    if (!match) {
        throw new Error("Disposable PostgreSQL probe port was not published");
    }
    return Number(match[1]);
}

function command(cmd: string[]): boolean {
    return Bun.spawnSync({ cmd, stdout: "ignore", stderr: "ignore" }).exitCode === 0;
}
