import { chmod, readFile, writeFile, lstat, opendir } from "node:fs/promises";
import { join } from "node:path";
import type { UlviaPaths } from "../paths";
import { resolveServicePorts, type ServicePorts } from "./ports";
import { parseHosting } from "./hosting";
import type { InstallationHosting } from "./hosting";
import { instancePublicUrl } from "./ports";
import { atomicPrivateWrite } from "./orchestration/deployment/storage";
import { hostingOrigin } from "@bernouy/hosting";
import { parseCaptureConnection } from "./captures/configuration";
import type { CaptureConnection } from "./captures/configuration";
const SCHEMA = "ulvia.installation.v1" as const;

type InstallationTls = Readonly<{ mode: "disabled" }> | Readonly<{ mode: "acme"; email: string; httpsPort: number }>;

export type InstallationConfig = Readonly<{
    schema: typeof SCHEMA;
    bindAddress: string;
    ports: ServicePorts;
    tls: InstallationTls;
    hosting: InstallationHosting;
    capture?: CaptureConnection;
}>;

export function defaultInstallationConfig(environment: Record<string, string | undefined> = {}): InstallationConfig {
    const ports = resolveServicePorts(environment);
    return Object.freeze({
        schema: SCHEMA,
        bindAddress: "127.0.0.1",
        ports,
        tls: Object.freeze({ mode: "disabled" }),
        hosting: parseHosting({
            controlOrigin: instancePublicUrl("control.localhost", { ports, tls: { mode: "disabled" } }),
            edgeCount: 1,
            managedSuffixes: [],
            publicAddresses: [],
        }),
    });
}

export async function loadOrCreateInstallationConfig(
    paths: UlviaPaths,
    environment: Record<string, string | undefined> = {},
): Promise<InstallationConfig> {
    const existing = await loadInstallationConfig(paths);
    if (existing) {
        return existing;
    }
    await assertFreshInstallation(paths);
    const defaults = defaultInstallationConfig(environment);
    return await saveInstallationConfig(paths, defaults, true);
}

export async function assertFreshInstallation(paths: UlviaPaths): Promise<void> {
    for (const name of ["stack.json", "runtime.json"]) {
        if (
            await lstat(join(paths.services, name)).then(
                () => true,
                (cause: NodeJS.ErrnoException) => {
                    if (cause.code === "ENOENT") {
                        return false;
                    }
                    throw cause;
                },
            )
        ) {
            throw new Error(
                "Installation configuration is missing from existing infrastructure state; operator recovery is required",
            );
        }
    }
    for (const path of [paths.mongo, paths.cmsFiles, join(paths.data, "instances")]) {
        const directory = await opendir(path).catch((cause: NodeJS.ErrnoException) => {
            if (cause.code === "ENOENT") {
                return null;
            }
            throw cause;
        });
        if (!directory) {
            continue;
        }
        try {
            if (await directory.read()) {
                throw new Error(
                    "Installation configuration is missing from populated state; operator recovery is required",
                );
            }
        } finally {
            await directory.close();
        }
    }
}

export async function loadInstallationConfig(paths: UlviaPaths): Promise<InstallationConfig | null> {
    const path = installationPath(paths);
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
    return parseInstallationConfig(JSON.parse(source));
}

export async function saveInstallationConfig(
    paths: UlviaPaths,
    config: InstallationConfig,
    exclusive = false,
): Promise<InstallationConfig> {
    const normalized = parseInstallationConfig(config);
    const path = installationPath(paths);
    try {
        if (exclusive) {
            await writeFile(path, `${JSON.stringify(normalized, null, 2)}\n`, { flag: "wx", mode: 0o600 });
        } else {
            await atomicPrivateWrite(path, `${JSON.stringify(normalized, null, 2)}\n`);
        }
    } catch (error) {
        if (!exclusive || (error as NodeJS.ErrnoException).code !== "EEXIST") {
            throw error;
        }
        const concurrent = await loadInstallationConfig(paths);
        if (!concurrent) {
            throw new Error("Ulvia installation configuration disappeared during creation");
        }
        return concurrent;
    }
    await chmod(path, 0o600);
    return normalized;
}

export function parseInstallationConfig(value: unknown): InstallationConfig {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("Ulvia installation configuration is invalid");
    }
    const record = value as Record<string, unknown>;
    if (
        Object.keys(record)
            .filter((key) => key !== "capture")
            .sort()
            .join(",") !== "bindAddress,hosting,ports,schema,tls"
    ) {
        throw new Error("Ulvia installation configuration is invalid");
    }
    const ports = parsePorts(record.ports);
    const tls = parseTls(record.tls);
    const hosting = parseHosting(record.hosting);
    const origin = hostingOrigin(hosting.controlOrigin);
    if (instancePublicUrl(origin.hostname, { ports, tls }) !== hosting.controlOrigin) {
        throw new Error("Control origin does not match the configured public listeners");
    }
    if (record.schema !== SCHEMA || !validBindAddress(record.bindAddress)) {
        throw new Error("Ulvia installation configuration is invalid");
    }
    return Object.freeze({
        schema: SCHEMA,
        bindAddress: record.bindAddress,
        ports,
        tls,
        hosting,
        ...("capture" in record ? { capture: parseCaptureConnection(record.capture) } : {}),
    });
}

function parsePorts(value: unknown): ServicePorts {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("Ulvia installation ports are invalid");
    }
    const record = value as Record<string, unknown>;
    if (Object.keys(record).sort().join(",") !== "http,provider") {
        throw new Error("Ulvia installation ports are invalid");
    }
    const ports = { http: port(record.http), provider: port(record.provider) };
    if (new Set(Object.values(ports)).size !== 2) {
        throw new Error("Ulvia installation ports must be distinct");
    }
    return Object.freeze(ports);
}

function parseTls(value: unknown): InstallationTls {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("Ulvia installation TLS configuration is invalid");
    }
    const record = value as Record<string, unknown>;
    if (record.mode === "disabled" && Object.keys(record).length === 1) {
        return Object.freeze({ mode: "disabled" });
    }
    if (
        record.mode === "acme" &&
        Object.keys(record).sort().join(",") === "email,httpsPort,mode" &&
        validEmail(record.email)
    ) {
        return Object.freeze({ mode: "acme", email: record.email, httpsPort: port(record.httpsPort) });
    }
    throw new Error("Ulvia installation TLS configuration is invalid");
}

function validBindAddress(value: unknown): value is string {
    return typeof value === "string" && /^(?:0\.0\.0\.0|127\.0\.0\.1)$/u.test(value);
}

function validEmail(value: unknown): value is string {
    return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value) && value.length <= 320;
}

function port(value: unknown): number {
    if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > 65_535) {
        throw new Error("Ulvia installation port must be an integer between 1 and 65535");
    }
    return Number(value);
}

function installationPath(paths: UlviaPaths): string {
    return join(paths.services, "installation.json");
}
