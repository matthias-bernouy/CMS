import { mkdir, readFile, rm } from "node:fs/promises";
import { createConnection } from "node:net";
import { join } from "node:path";
import type { DevPorts } from "../runtime/cms";
import { ensureUlviaPaths, resolveUlviaPaths, type UlviaPaths } from "../runtime/paths";

export async function createFreshDevPaths(dataDirectory: string, current: UlviaPaths): Promise<UlviaPaths> {
    const paths = resolveUlviaPaths({ ULVIA_DATA_DIR: dataDirectory });
    if (paths.data === current.data) {
        throw new Error("The new development data directory must differ from the current one");
    }
    const created = await mkdir(paths.data, { recursive: true, mode: 0o700 });
    if (created === undefined) {
        throw new Error(`Development data directory already exists: ${paths.data}`);
    }
    await ensureUlviaPaths(paths);
    return paths;
}

export async function resetDevData(paths: UlviaPaths): Promise<void> {
    await assertUlviaDevEnvironment(paths);
    await rm(paths.repository, { recursive: true, force: true });
    await rm(paths.dev, { recursive: true, force: true });
    await ensureUlviaPaths(paths);
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
    const source = await readFile(join(paths.dev, "runtime.json"), "utf8").catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
            return null;
        }
        throw error;
    });
    if (source === null) {
        throw new Error(`No initialized Ulvia development environment exists at ${paths.data}`);
    }
    let value: { schema?: unknown };
    try {
        value = JSON.parse(source) as { schema?: unknown };
    } catch {
        throw new Error(`Refusing to reset unrecognized development data at ${paths.data}`);
    }
    if (value.schema !== "ulvia.dev-runtime.v1") {
        throw new Error(`Refusing to reset unrecognized development data at ${paths.data}`);
    }
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
