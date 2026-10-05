import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { DevPorts } from "./cms";
import type { UlviaPaths } from "./paths";
import { spawnCommand } from "./process";

export async function loadOrCreateProviderToken(devRoot: string): Promise<string> {
    const path = join(devRoot, "provider-token");
    const existing = await readToken(path);
    if (existing) {
        return existing;
    }
    const candidate = randomBytes(32).toString("base64url");
    try {
        await writeFile(path, candidate, { flag: "wx", mode: 0o600 });
        return candidate;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
            throw error;
        }
        const concurrent = await readToken(path);
        if (!concurrent) {
            throw new Error("Provider token disappeared during creation");
        }
        return concurrent;
    }
}

export async function startLocalProvider(paths: UlviaPaths, ports: DevPorts) {
    const token = await loadOrCreateProviderToken(paths.dev);
    const entrypoint = fileURLToPath(import.meta.resolve("@bernouy/ulvia-official-provider/server"));
    const cmsEntrypoint = fileURLToPath(import.meta.resolve("@bernouy/cms-server"));
    const cmsPackage = (await Bun.file(resolve(dirname(cmsEntrypoint), "../package.json")).json()) as {
        version?: unknown;
    };
    if (typeof cmsPackage.version !== "string") {
        throw new Error("Local CMS package version is unavailable");
    }
    const resourceRoot = resolve(import.meta.dir, "../../../../official-repository");
    const provider = spawnCommand([process.execPath, entrypoint], {
        inherit: true,
        env: {
            ...process.env,
            ULVIA_OFFICIAL_RESOURCE_ROOT: resourceRoot,
            ULVIA_OFFICIAL_DATA_DIR: join(paths.dev, "official-provider"),
            ULVIA_OFFICIAL_TOKEN: token,
            ULVIA_OFFICIAL_PORT: String(ports.provider),
            ULVIA_OFFICIAL_CORE_VERSION: cmsPackage.version,
            ULVIA_OFFICIAL_CORE_HEALTH_URL: `http://127.0.0.1:${ports.control}`,
        },
    });
    const url = `http://127.0.0.1:${ports.provider}`;
    try {
        const deadline = Date.now() + 30_000;
        while (Date.now() < deadline) {
            if (provider.exitCode !== null) {
                throw new Error(`Official provider exited during startup (${provider.exitCode})`);
            }
            const ready = await fetch(`${url}/ulvia/report`, {
                headers: { Authorization: `Bearer ${token}` },
            }).then(
                (response) => response.ok,
                () => false,
            );
            if (ready) {
                return { process: provider, url, token };
            }
            await Bun.sleep(250);
        }
        throw new Error("Official provider did not become ready");
    } catch (error) {
        provider.kill("SIGTERM");
        throw error;
    }
}

export async function stopLocalProvider(provider: ReturnType<typeof spawnCommand>): Promise<void> {
    if (provider.exitCode !== null) {
        return;
    }
    provider.kill("SIGTERM");
    await provider.exited;
}

async function readToken(path: string): Promise<string | null> {
    const value = await readFile(path, "utf8").catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
            return null;
        }
        throw error;
    });
    if (value === null) {
        return null;
    }
    if (!/^[A-Za-z0-9_-]{43}$/u.test(value)) {
        throw new Error("Local provider token is invalid");
    }
    return value;
}
