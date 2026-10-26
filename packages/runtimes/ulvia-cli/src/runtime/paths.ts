import { chmod, lstat, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

export type UlviaPaths = Readonly<{
    data: string;
    repository: string;
    services: string;
    mongo: string;
    cmsFiles: string;
    serviceLogs: string;
    proxy: Readonly<{
        certificates: string;
        virtualHosts: string;
        challenge: string;
        acme: string;
    }>;
    instances: string;
}>;

export type LocalInstancePaths = Readonly<{
    root: string;
    logs: string;
}>;

export function resolveUlviaPaths(
    environment: Record<string, string | undefined> = process.env,
    userHome = homedir(),
): UlviaPaths {
    const explicit = environment.ULVIA_DATA_DIR?.trim();
    const data = explicit ? absolutePath(explicit, "ULVIA_DATA_DIR") : resolveUlviaDataHome(environment, userHome);
    const services = join(data, "services");
    return Object.freeze({
        data,
        repository: join(data, "repository"),
        services,
        mongo: join(services, "mongo"),
        cmsFiles: join(services, "cms-files"),
        serviceLogs: join(services, "logs"),
        proxy: {
            certificates: join(services, "proxy", "certificates"),
            virtualHosts: join(services, "proxy", "virtual-hosts"),
            challenge: join(services, "proxy", "challenge"),
            acme: join(services, "proxy", "acme"),
        },
        instances: join(data, "instances"),
    });
}

export function resolveLocalInstancePaths(paths: UlviaPaths, name: string): LocalInstancePaths {
    assertLocalInstanceName(name);
    const root = join(paths.instances, name);
    return Object.freeze({ root, logs: join(root, "logs") });
}

export function assertLocalInstanceName(name: string): void {
    if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(name) || name.length > 48) {
        throw new Error("Instance name must be lowercase kebab-case and at most 48 characters");
    }
}

function resolveUlviaDataHome(
    environment: Record<string, string | undefined> = process.env,
    userHome = homedir(),
): string {
    const xdg = environment.XDG_DATA_HOME?.trim();
    return join(xdg ? absolutePath(xdg, "XDG_DATA_HOME") : join(userHome, ".local", "share"), "ulvia");
}

export async function ensureUlviaPaths(paths: UlviaPaths): Promise<void> {
    await ensureDirectory(paths.data);
    await Promise.all([
        ensureDirectory(paths.repository),
        ensureDirectory(paths.services),
        ensureDirectory(paths.mongo),
        ensureDirectory(paths.cmsFiles),
        ensureDirectory(paths.serviceLogs),
        ensureDirectory(paths.proxy.certificates),
        ensureDirectory(paths.proxy.virtualHosts),
        // Nginx workers serve public HTTP-01 tokens through this dedicated bind mount.
        ensureDirectory(paths.proxy.challenge, 0o755),
        ensureDirectory(paths.proxy.acme),
        ensureDirectory(paths.instances),
    ]);
}

export async function ensureLocalInstancePaths(paths: LocalInstancePaths): Promise<void> {
    await Promise.all([ensureDirectory(paths.root), ensureDirectory(paths.logs)]);
}

export async function assertLocalInstancePaths(paths: LocalInstancePaths): Promise<void> {
    const metadata = await lstat(paths.root).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
            return null;
        }
        throw error;
    });
    if (!metadata?.isDirectory() || metadata.isSymbolicLink()) {
        throw new Error(`Unknown or unsafe local instance directory: ${paths.root}`);
    }
}

async function ensureDirectory(path: string, mode = 0o700): Promise<void> {
    await mkdir(path, { recursive: true, mode });
    const metadata = await lstat(path);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
        throw new Error(`Ulvia data path must be a real directory: ${path}`);
    }
    await chmod(path, mode);
}

function absolutePath(value: string, name: string): string {
    if (!isAbsolute(value)) {
        throw new Error(`${name} must be an absolute path`);
    }
    return resolve(value);
}
