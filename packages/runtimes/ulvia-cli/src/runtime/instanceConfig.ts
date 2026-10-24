import { randomBytes } from "node:crypto";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const SCHEMA = "ulvia.local-instance-runtime.v1" as const;

export type LocalInstanceConfig = Readonly<{
    schema: typeof SCHEMA;
    name: string;
    label: string;
    hostname: string;
    adminEmail: string;
    adminPassword: string;
}>;

export async function loadOrCreateLocalInstanceConfig(
    root: string,
    input: Readonly<{ name: string; label: string; hostname: string }>,
): Promise<LocalInstanceConfig> {
    const path = join(root, "runtime.json");
    const existing = await loadLocalInstanceConfig(root);
    if (existing) {
        assertSameIdentity(existing, input);
        return existing;
    }
    const config: LocalInstanceConfig = {
        schema: SCHEMA,
        ...input,
        adminEmail: "admin@ulvia.local",
        adminPassword: `${randomBytes(24).toString("base64url")}Aa1!`,
    };
    try {
        await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
            throw error;
        }
        const concurrent = await loadLocalInstanceConfig(root);
        if (concurrent) {
            assertSameIdentity(concurrent, input);
            return concurrent;
        }
        throw error;
    }
    return config;
}

export async function loadLocalInstanceConfig(root: string): Promise<LocalInstanceConfig | null> {
    const path = join(root, "runtime.json");
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
    const value = JSON.parse(source) as Partial<LocalInstanceConfig>;
    if (
        value.schema !== SCHEMA ||
        typeof value.name !== "string" ||
        typeof value.label !== "string" ||
        value.label.length < 1 ||
        value.label.length > 80 ||
        /[\u0000-\u001f\u007f]/u.test(value.label) ||
        typeof value.hostname !== "string" ||
        !validHostname(value.hostname) ||
        !validEmail(value.adminEmail) ||
        !secret(value.adminPassword)
    ) {
        throw new Error("Ulvia local instance configuration is invalid");
    }
    return value as LocalInstanceConfig;
}

function validEmail(value: unknown): value is string {
    return typeof value === "string" && value.includes("@") && value.length <= 320;
}

export function validHostname(value: string): boolean {
    if (value === "localhost") {
        return true;
    }
    if (value.length > 253 || value.endsWith(".") || !value.includes(".") || /^\d+(?:\.\d+){3}$/u.test(value)) {
        return false;
    }
    return value.split(".").every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(label));
}

function secret(value: unknown): value is string {
    return typeof value === "string" && value.length >= 24 && value.length <= 256;
}

function assertSameIdentity(
    config: LocalInstanceConfig,
    input: Readonly<{ name: string; label: string; hostname: string }>,
): void {
    if (config.name !== input.name || config.label !== input.label || config.hostname !== input.hostname) {
        throw new Error(`Local instance configuration conflicts with ${input.name}`);
    }
}
