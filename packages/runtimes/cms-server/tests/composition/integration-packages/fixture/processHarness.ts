import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

export type FixtureRole = "repository" | "cms";
export type FixtureReady = {
    type: "ready";
    role: FixtureRole;
    pid: number;
    port?: number;
    controlPort?: number;
    deliveryPort?: number;
};

export type FixtureProcess = {
    process: ReturnType<typeof Bun.spawn>;
    ready: FixtureReady;
    stdout: string[];
    stderr: string[];
    stop(): Promise<void>;
};

const workspaceRoot = resolve(import.meta.dir, "../../../../../../..");
const fixtureEntrypoint = join(import.meta.dir, "processFixture.ts");

export async function spawnFixture(
    role: FixtureRole,
    config: Record<string, unknown>,
    configPath: string,
): Promise<FixtureProcess> {
    await writeFile(configPath, `${JSON.stringify(config)}\n`, "utf8");
    const child = Bun.spawn([process.execPath, "run", fixtureEntrypoint, role, configPath], {
        cwd: workspaceRoot,
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
    });
    const stdout: string[] = [];
    const stderr: string[] = [];
    const readiness = deferred<FixtureReady>();
    void consumeLines(child.stdout, stdout, (line) => {
        const value = parseReady(line);
        if (value) {
            readiness.resolve(value);
        }
    });
    void consumeLines(child.stderr, stderr);

    let ready: FixtureReady;
    try {
        ready = await withTimeout(
            Promise.race([
                readiness.promise,
                child.exited.then((code) => {
                    throw new Error(`Fixture ${role} exited before readiness (${code}): ${stderr.join("\n")}`);
                }),
            ]),
            3_000,
            `Fixture ${role} readiness timed out`,
        );
    } catch (error) {
        child.kill("SIGKILL");
        await child.exited;
        throw error;
    }

    return {
        process: child,
        ready,
        stdout,
        stderr,
        async stop() {
            if (child.exitCode !== null) {
                return;
            }
            child.kill("SIGTERM");
            try {
                await withTimeout(child.exited, 2_000, `Fixture ${role} did not stop after SIGTERM`);
            } catch (error) {
                child.kill("SIGKILL");
                await child.exited;
                throw error;
            }
        },
    };
}

async function consumeLines(
    stream: ReadableStream<Uint8Array>,
    destination: string[],
    onLine?: (line: string) => void,
): Promise<void> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let pending = "";
    while (true) {
        const { done, value } = await reader.read();
        pending += decoder.decode(value, { stream: !done });
        const lines = pending.split(/\r?\n/);
        pending = lines.pop() ?? "";
        for (const line of lines) {
            destination.push(line);
            onLine?.(line);
        }
        if (done) {
            if (pending) {
                destination.push(pending);
                onLine?.(pending);
            }
            return;
        }
    }
}

function parseReady(line: string): FixtureReady | null {
    try {
        const value = JSON.parse(line) as Partial<FixtureReady>;
        return value.type === "ready" && typeof value.pid === "number" ? (value as FixtureReady) : null;
    } catch {
        return null;
    }
}

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => {
        resolve = done;
    });
    return { promise, resolve };
}

async function withTimeout<T>(promise: Promise<T>, milliseconds: number, message: string): Promise<T> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            promise,
            new Promise<never>((_, reject) => {
                timeout = setTimeout(() => reject(new Error(message)), milliseconds);
            }),
        ]);
    } finally {
        if (timeout !== undefined) {
            clearTimeout(timeout);
        }
    }
}
