import { lstat, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

export type UlviaPaths = Readonly<{
    data: string;
    repository: string;
    packages: string;
    dev: string;
    supabase: string;
    mongo: string;
    cmsFiles: string;
}>;

export function resolveUlviaPaths(
    environment: Record<string, string | undefined> = process.env,
    userHome = homedir(),
): UlviaPaths {
    const explicit = environment.ULVIA_DATA_DIR?.trim();
    const xdg = environment.XDG_DATA_HOME?.trim();
    const data = explicit
        ? absolutePath(explicit, "ULVIA_DATA_DIR")
        : join(xdg ? absolutePath(xdg, "XDG_DATA_HOME") : join(userHome, ".local", "share"), "ulvia");
    const repository = join(data, "repository");
    const dev = join(data, "dev");
    return Object.freeze({
        data,
        repository,
        packages: join(repository, "packages"),
        dev,
        supabase: join(dev, "supabase"),
        mongo: join(dev, "mongo"),
        cmsFiles: join(dev, "cms-files"),
    });
}

export async function ensureUlviaPaths(paths: UlviaPaths): Promise<void> {
    await ensurePrivateDirectory(paths.data);
    await Promise.all([
        ensurePrivateDirectory(paths.repository),
        ensurePrivateDirectory(paths.dev),
        ensurePrivateDirectory(paths.packages),
        ensurePrivateDirectory(paths.supabase),
        ensurePrivateDirectory(paths.mongo),
        ensurePrivateDirectory(paths.cmsFiles),
    ]);
}

async function ensurePrivateDirectory(path: string): Promise<void> {
    await mkdir(path, { recursive: true, mode: 0o700 });
    const metadata = await lstat(path);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
        throw new Error(`Ulvia data path must be a real directory: ${path}`);
    }
}

function absolutePath(value: string, name: string): string {
    if (!isAbsolute(value)) {
        throw new Error(`${name} must be an absolute path`);
    }
    return resolve(value);
}
