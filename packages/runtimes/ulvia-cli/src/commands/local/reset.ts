import { chmod, lstat, opendir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { loadLocalInstanceConfig } from "../../runtime/instanceConfig";
import { loadLocalInstanceConnection } from "../../runtime/instanceConnection";
import { ensureUlviaPaths, type UlviaPaths } from "../../runtime/paths";
import { loadInstallationConfig } from "../../runtime/stack/installation";
import { destroyLocalKernel, listLocalInstanceNames } from "../../runtime/stack/orchestration/instances";
import { destroyLocalServices } from "../../runtime/stack/orchestration/services";

export async function resetLocalInstallation(paths: UlviaPaths, log: (message: string) => void): Promise<void> {
    await assertRecognizedData(paths);
    for (const name of await listLocalInstanceNames(paths)) {
        const root = join(paths.instances, name);
        const [config, connection] = await Promise.all([
            loadLocalInstanceConfig(root),
            loadLocalInstanceConnection(root),
        ]);
        if (connection && !config) {
            throw new Error(`Refusing to reset incomplete Ulvia instance data at ${root}`);
        }
        if (config && connection) {
            await destroyLocalKernel(paths, name);
        }
    }
    await destroyLocalServices(paths);
    await resetLocalData(paths);
    log(`Reset local Ulvia installation: ${paths.data}`);
    log("Run ulvia start, then provision a fresh instance with: ulvia instance create <name>");
}

export async function resetLocalData(paths: UlviaPaths): Promise<void> {
    await assertRecognizedData(paths);
    for (const path of [paths.repository, paths.services, paths.instances]) {
        await makeTreeOwnerRemovable(path);
        await rm(path, { recursive: true, force: true });
    }
    await ensureUlviaPaths(paths);
}

async function assertRecognizedData(paths: UlviaPaths): Promise<void> {
    const serviceSchema = await readSchema(join(paths.services, "runtime.json"));
    const installation = await loadInstallationConfig(paths);
    if (serviceSchema === null && installation === null) {
        await assertEmptySkeleton(paths.services, new Set(["cms-files", "domains", "mongo", "proxy"]));
    } else if (serviceSchema !== "ulvia.services.v2" && serviceSchema !== "ulvia.local-services.v1") {
        throw new Error(`Refusing to reset unrecognized Ulvia data (shared services) at ${paths.data}`);
    }
    for (const name of await listLocalInstanceNames(paths)) {
        const root = join(paths.instances, name);
        const schema = await readSchema(join(root, "runtime.json"));
        if (schema === null) {
            await assertEmptySkeleton(root, new Set());
        } else if (schema !== "ulvia.local-instance-runtime.v1") {
            throw new Error(`Refusing to reset unrecognized Ulvia instance data at ${root}`);
        }
    }
}

async function readSchema(path: string): Promise<unknown | null> {
    const source = await readFile(path, "utf8").catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
            return null;
        }
        throw error;
    });
    if (source === null) {
        return null;
    }
    try {
        return (JSON.parse(source) as { schema?: unknown }).schema;
    } catch {
        return undefined;
    }
}

async function assertEmptySkeleton(path: string, allowed: ReadonlySet<string>): Promise<void> {
    const directory = await opendir(path);
    for await (const entry of directory) {
        if (!allowed.has(entry.name) || !entry.isDirectory() || entry.isSymbolicLink()) {
            throw new Error(`Refusing to reset data without a recognized Ulvia marker at ${path}`);
        }
        await assertEmptyDirectoryTree(join(path, entry.name));
    }
}

async function assertEmptyDirectoryTree(path: string): Promise<void> {
    const directory = await opendir(path);
    for await (const entry of directory) {
        if (!entry.isDirectory() || entry.isSymbolicLink()) {
            throw new Error(`Refusing to reset data without a recognized Ulvia marker at ${path}`);
        }
        await assertEmptyDirectoryTree(join(path, entry.name));
    }
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
