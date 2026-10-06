import { randomBytes } from "node:crypto";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const SCHEMA = "ulvia.dev-runtime.v1" as const;

export type DevRuntimeConfig = Readonly<{
    schema: typeof SCHEMA;
    adminEmail: string;
    adminPassword: string;
    sessionSecret: string;
    kekHex: string;
}>;

export async function loadOrCreateDevRuntimeConfig(devRoot: string): Promise<DevRuntimeConfig> {
    const path = join(devRoot, "runtime.json");
    const existing = await readConfig(path);
    if (existing) {
        return existing;
    }
    const config: DevRuntimeConfig = {
        schema: SCHEMA,
        adminEmail: "dev@ulvia.local",
        adminPassword: `${randomBytes(24).toString("base64url")}Aa1!`,
        sessionSecret: randomBytes(48).toString("base64url"),
        kekHex: randomBytes(32).toString("hex"),
    };
    try {
        await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, { flag: "wx", mode: 0o600 });
        return config;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
            throw error;
        }
        const concurrent = await readConfig(path);
        if (!concurrent) {
            throw new Error("Ulvia dev runtime configuration disappeared during creation");
        }
        return concurrent;
    }
}

export async function loadOrCreateRepositoryToken(devRoot: string): Promise<string> {
    return loadOrCreateToken(join(devRoot, "repository-token"), "Repository");
}

export async function loadOrCreateCoreProviderToken(devRoot: string): Promise<string> {
    return loadOrCreateToken(join(devRoot, "core-provider-token"), "CMS Core provider");
}

async function loadOrCreateToken(path: string, label: string): Promise<string> {
    const existing = await readSecret(path);
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
        const concurrent = await readSecret(path);
        if (!concurrent) {
            throw new Error(`${label} token disappeared during creation`);
        }
        return concurrent;
    }
}

async function readConfig(path: string): Promise<DevRuntimeConfig | null> {
    const source = await readFile(path, "utf8").catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
            return null;
        }
        throw error;
    });
    if (source === null) {
        return null;
    }
    await chmod(path, 0o600);
    const value = JSON.parse(source) as Partial<DevRuntimeConfig>;
    if (
        value.schema !== SCHEMA ||
        !validEmail(value.adminEmail) ||
        !secret(value.adminPassword) ||
        !secret(value.sessionSecret) ||
        !/^[a-f0-9]{64}$/u.test(value.kekHex ?? "")
    ) {
        throw new Error("Ulvia dev runtime configuration is invalid");
    }
    return value as DevRuntimeConfig;
}

function validEmail(value: unknown): value is string {
    return typeof value === "string" && value.includes("@") && value.length <= 320;
}

function secret(value: unknown): value is string {
    return typeof value === "string" && value.length >= 24 && value.length <= 256;
}

async function readSecret(path: string): Promise<string | null> {
    const value = await readFile(path, "utf8").catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
            return null;
        }
        throw error;
    });
    if (value !== null && !/^[A-Za-z0-9_-]{43}$/u.test(value)) {
        throw new Error("Local runtime token is invalid");
    }
    return value;
}
