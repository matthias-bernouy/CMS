import { constants } from "node:fs";
import { chmod, lstat, mkdir, open, rename, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { withRepositoryWriteLock } from "@bernouy/cms-repository/repository/filesystem";

export type ClientIdentity = { keyFile: string; publicKey: string };
export type ClientConfig = {
    schema: "ulvia.client.v1";
    identities: Record<string, ClientIdentity>;
    activeIdentity?: string;
    repository?: { url: string; repositoryId: string };
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

export async function privateDirectory(path: string): Promise<void> {
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
        return { schema: "ulvia.client.v1", identities: {} };
    }
    try {
        const metadata = await handle.stat();
        if (!metadata.isFile() || metadata.size > 65_536 || (metadata.mode & 0o077) !== 0) {
            throw new Error("Ulvia client configuration must be a private bounded file");
        }
        const value = JSON.parse(await handle.readFile("utf8")) as ClientConfig;
        if (
            !value ||
            value.schema !== "ulvia.client.v1" ||
            !value.identities ||
            typeof value.identities !== "object" ||
            Array.isArray(value.identities)
        ) {
            throw new Error("Invalid Ulvia client configuration");
        }
        for (const [name, identity] of Object.entries(value.identities)) {
            assertIdentityName(name);
            if (!identity || !isAbsolute(identity.keyFile) || typeof identity.publicKey !== "string") {
                throw new Error("Invalid saved identity");
            }
        }
        if (value.activeIdentity && !Object.hasOwn(value.identities, value.activeIdentity)) {
            throw new Error("Active identity is missing");
        }
        if (
            value.repository &&
            (typeof value.repository.url !== "string" || typeof value.repository.repositoryId !== "string")
        ) {
            throw new Error("Invalid saved Repository connection");
        }
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

export function assertIdentityName(name: string): void {
    if (!/^[a-z][a-z0-9-]{0,47}$/u.test(name) || name === "constructor" || name === "prototype") {
        throw new Error("Identity name must be lowercase kebab-case and at most 48 characters");
    }
}
