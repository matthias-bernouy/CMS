import { chmod, lstat, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

export type UlviaPaths = Readonly<{
    data: string;
    repository: string;
    services: string;
    mongo: string;
    cmsFiles: string;
    proxy: Readonly<{
        certificates: string;
    }>;
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
        proxy: {
            certificates: join(services, "proxy", "certificates"),
        },
    });
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
    await ensureDirectory(paths.services);
    await ensureDirectory(join(paths.services, "proxy"));
    await Promise.all([
        ensureDirectory(paths.repository),
        ensureDirectory(paths.mongo),
        ensureDirectory(paths.cmsFiles),
        ensureDirectory(paths.proxy.certificates),
    ]);
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
