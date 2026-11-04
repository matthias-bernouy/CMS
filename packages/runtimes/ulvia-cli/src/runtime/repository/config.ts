import { parseStrictJson } from "@bernouy/cms-repository/contracts/protocol";
import { constants } from "node:fs";
import { chmod, lstat, mkdir, open, rename, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { withRepositoryWriteLock } from "@bernouy/cms-repository/repository/filesystem/lock";

export type ClientConfig = {
    schema: "ulvia.client.v2";
    repository?: { url: string; repositoryId: string; token: string; generation: string };
};

export function clientConfigDirectory(environment: Record<string, string | undefined>, home = homedir()): string {
    const explicit = environment.ULVIA_CONFIG_DIR?.trim();
    const data = environment.ULVIA_DATA_DIR?.trim();
    const xdg = environment.XDG_CONFIG_HOME?.trim();
    const path = explicit || (data ? join(data, "config") : join(xdg || join(home, ".config"), "ulvia"));
    if (!isAbsolute(path)) {
        throw new Error("Ulvia configuration directory must be absolute");
    }
    return path;
}

async function privateDirectory(path: string): Promise<void> {
    await mkdir(path, { recursive: true, mode: 0o700 });
    const metadata = await lstat(path);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
        throw new Error("Ulvia configuration must use a real directory");
    }
    await chmod(path, 0o700);
}

export async function readClientConfig(directory: string): Promise<ClientConfig> {
    const handle = await open(join(directory, "config.json"), constants.O_RDONLY | constants.O_NOFOLLOW).catch(
        (error: NodeJS.ErrnoException) => {
            if (error.code === "ENOENT") {
                return null;
            }
            throw error;
        },
    );
    if (!handle) {
        return { schema: "ulvia.client.v2" };
    }
    try {
        const metadata = await handle.stat();
        if (!metadata.isFile() || metadata.size > 65_536 || (metadata.mode & 0o077) !== 0) {
            throw new Error("Ulvia client configuration must be a private bounded file");
        }
        const bytes = Buffer.alloc(65_537);
        const { bytesRead } = await handle.read(bytes, 0, bytes.byteLength, 0);
        const value = parseStrictJson(bytes.subarray(0, bytesRead), 65_536, 8) as ClientConfig;
        validateClientConfig(value);
        return value;
    } finally {
        await handle.close();
    }
}

export async function updateClientConfig<T>(
    directory: string,
    update: (config: ClientConfig) => Promise<T>,
): Promise<T> {
    await privateDirectory(directory);
    return withRepositoryWriteLock(directory, async () => {
        const config = await readClientConfig(directory);
        const result = await update(config);
        validateClientConfig(config);
        const temporary = join(directory, `${randomUUID()}.tmp`);
        try {
            await writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`, { flag: "wx", mode: 0o600 });
            await rename(temporary, join(directory, "config.json"));
        } finally {
            await rm(temporary, { force: true });
        }
        return result;
    });
}

function validateClientConfig(value: ClientConfig): void {
    if (
        !value ||
        typeof value !== "object" ||
        Array.isArray(value) ||
        value.schema !== "ulvia.client.v2" ||
        Object.keys(value).some((key) => !["schema", "repository"].includes(key))
    ) {
        throw new Error("Invalid Ulvia client configuration");
    }
    const saved = value.repository;
    if (saved === undefined) {
        return;
    }
    if (
        !saved ||
        typeof saved !== "object" ||
        Array.isArray(saved) ||
        Object.keys(saved).sort().join(",") !== "generation,repositoryId,token,url" ||
        typeof saved.url !== "string" ||
        saved.url.length > 2048 ||
        typeof saved.repositoryId !== "string" ||
        !/^[A-Za-z0-9._:-]{1,128}$/u.test(saved.repositoryId) ||
        typeof saved.token !== "string" ||
        !/^pat_[A-Za-z0-9_-]{43}$/u.test(saved.token) ||
        typeof saved.generation !== "string" ||
        !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u.test(saved.generation)
    ) {
        throw new Error("Invalid saved Repository connection");
    }
    const url = new URL(saved.url);
    if (
        url.origin !== saved.url ||
        (url.protocol !== "https:" &&
            !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
    ) {
        throw new Error("Invalid saved Repository origin");
    }
}
