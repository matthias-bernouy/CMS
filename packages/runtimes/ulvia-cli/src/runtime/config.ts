import { randomBytes } from "node:crypto";
import { chmod, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const SCHEMA = "ulvia.services.v1" as const;

export type LocalServicesConfig = Readonly<{
    schema: typeof SCHEMA;
    sessionSecret: string;
    kekHex: string;
    mongoUsername: string;
    mongoPassword: string;
    mongoProviderUsername: string;
    mongoProviderPassword: string;
}>;

export async function loadOrCreateLocalServicesConfig(servicesRoot: string): Promise<LocalServicesConfig> {
    const path = join(servicesRoot, "runtime.json");
    const existing = await readConfig(path);
    if (existing) {
        return existing;
    }
    await assertNoOrphanedEncryptedState(servicesRoot);
    const config: LocalServicesConfig = {
        schema: SCHEMA,
        sessionSecret: randomBytes(48).toString("base64url"),
        kekHex: randomBytes(32).toString("hex"),
        mongoUsername: "ulvia",
        mongoPassword: randomBytes(32).toString("base64url"),
        mongoProviderUsername: "ulvia_provider",
        mongoProviderPassword: randomBytes(32).toString("base64url"),
    };
    return await writeExclusiveConfig(path, config);
}

export async function loadOrCreateProviderOperatorToken(servicesRoot: string): Promise<string> {
    return await loadOrCreateToken(join(servicesRoot, "provider-operator-token"), "Ulvia Provider operator");
}

async function assertNoOrphanedEncryptedState(servicesRoot: string): Promise<void> {
    const entries = await readdir(join(servicesRoot, "mongo")).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
            return [];
        }
        throw error;
    });
    if (entries.length > 0) {
        throw new Error(
            "Ulvia service credentials are missing while persistent MongoDB data exists. Run ulvia reset --yes.",
        );
    }
}

async function writeExclusiveConfig(path: string, config: LocalServicesConfig): Promise<LocalServicesConfig> {
    try {
        await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, { flag: "wx", mode: 0o600 });
        return config;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
            throw error;
        }
        const concurrent = await readConfig(path);
        if (!concurrent) {
            throw new Error("Ulvia local service configuration disappeared during creation");
        }
        return concurrent;
    }
}

async function readConfig(path: string): Promise<LocalServicesConfig | null> {
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
    const value = JSON.parse(source) as Partial<Omit<LocalServicesConfig, "schema">> & { schema?: unknown };
    if (
        value.schema !== SCHEMA ||
        !secret(value.sessionSecret) ||
        !/^[a-f0-9]{64}$/u.test(value.kekHex ?? "") ||
        value.mongoUsername !== "ulvia" ||
        !/^[A-Za-z0-9_-]{43}$/u.test(value.mongoPassword ?? "") ||
        value.mongoProviderUsername !== "ulvia_provider" ||
        !/^[A-Za-z0-9_-]{43}$/u.test(value.mongoProviderPassword ?? "")
    ) {
        throw new Error("Ulvia local service configuration is invalid");
    }
    return value as LocalServicesConfig;
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

function secret(value: unknown): value is string {
    return typeof value === "string" && value.length >= 24 && value.length <= 256;
}
