import { chmod, lstat, opendir, readFile, rm } from "node:fs/promises";
import { createConnection } from "node:net";
import { join } from "node:path";
import type { DevPorts } from "../runtime/cms";
import { stopLocalMongo } from "../runtime/mongo";
import { ensureUlviaPaths, type UlviaPaths } from "../runtime/paths";
import { readProjectEnvironment } from "../runtime/dev/projectEnvironmentConfig";

export async function resetCurrentDevEnvironment(
    paths: UlviaPaths,
    ports: DevPorts,
    log: (message: string) => void,
): Promise<void> {
    await assertDevServersStopped(ports);
    await stopLocalMongo(paths.mongo);
    await resetDevData(paths);
    log(`Reset development environment: ${paths.data}`);
    log("Run ulvia dev to provision a fresh instance.");
}

export async function resetDevData(paths: UlviaPaths): Promise<void> {
    await assertUlviaDevEnvironment(paths);
    await makeTreeOwnerRemovable(paths.repository);
    await makeTreeOwnerRemovable(paths.dev);
    await rm(paths.repository, { recursive: true, force: true });
    await rm(paths.dev, { recursive: true, force: true });
    await ensureUlviaPaths(paths);
}

async function makeTreeOwnerRemovable(path: string): Promise<void> {
    const metadata = await lstat(path).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
            return null;
        }
        throw error;
    });
    if (metadata === null) {
        return;
    }
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
        throw new Error(`Refusing to reset non-directory Ulvia data: ${path}`);
    }
    await chmod(path, metadata.mode | 0o700);
    const directory = await opendir(path);
    for await (const entry of directory) {
        if (entry.isDirectory() && !entry.isSymbolicLink()) {
            await makeTreeOwnerRemovable(join(path, entry.name));
        }
    }
}

export async function assertDevServersStopped(
    ports: DevPorts,
    isReachable: (port: number) => Promise<boolean> = canConnect,
): Promise<void> {
    const services: readonly (readonly [string, number])[] = [
        ["CMS Kernel", ports.kernel],
        ["resource repository", ports.repository],
        ["Ulvia Provider", ports.provider],
    ];
    const running = (
        await Promise.all(services.map(async ([name, port]) => ((await isReachable(port)) ? name : null)))
    ).filter((name) => name !== null);
    if (running.length > 0) {
        throw new Error(`Stop the active development stack before continuing (${running.join(", ")})`);
    }
}

async function assertUlviaDevEnvironment(paths: UlviaPaths): Promise<void> {
    try {
        if (await readProjectEnvironment(join(paths.data, "environment.json"), true)) {
            return;
        }
    } catch {
        throw new Error(`Refusing to reset unrecognized development data at ${paths.data}`);
    }
    const source = await readFile(join(paths.dev, "runtime.json"), "utf8").catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
            return null;
        }
        throw error;
    });
    if (source !== null) {
        try {
            if ((JSON.parse(source) as { schema?: unknown }).schema === "ulvia.dev-runtime.v1") {
                return;
            }
        } catch {
            // Fall through to the guarded refusal below.
        }
        throw new Error(`Refusing to reset unrecognized development data at ${paths.data}`);
    }
    throw new Error(`No initialized Ulvia development environment exists at ${paths.data}`);
}

function canConnect(port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const socket = createConnection({ host: "127.0.0.1", port });
        socket.setTimeout(300);
        socket.once("connect", () => {
            socket.destroy();
            resolve(true);
        });
        socket.once("error", () => resolve(false));
        socket.once("timeout", () => {
            socket.destroy();
            resolve(false);
        });
    });
}
