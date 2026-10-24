import { readdir } from "node:fs/promises";
import { loadLocalInstanceConfig } from "../../runtime/instanceConfig";
import type { UlviaPaths } from "../../runtime/paths";
import { resolveLocalInstancePaths } from "../../runtime/paths";
import {
    defaultInstallationConfig,
    loadInstallationConfig,
    parseInstallationConfig,
    saveInstallationConfig,
    type InstallationConfig,
} from "../../runtime/stack/installation";

export async function configureCommand(
    args: readonly string[],
    paths: UlviaPaths,
    environment: Record<string, string | undefined>,
    log: (message: string) => void,
): Promise<void> {
    const [area, ...options] = args;
    if (area !== "network") {
        throw new Error(`Usage: ${usage()}`);
    }
    const current = (await loadInstallationConfig(paths)) ?? defaultInstallationConfig(environment);
    if (options.length === 0) {
        printConfiguration(current, log);
        return;
    }
    if (await hasConfiguredInstance(paths)) {
        throw new Error("Network configuration is locked after the first instance is created");
    }
    const values = parseOptions(options);
    const tlsMode = values.get("--tls") ?? current.tls.mode;
    const tls =
        tlsMode === "disabled"
            ? disabledTls(values)
            : acmeTls(values, current.tls.mode === "acme" ? current.tls : undefined);
    const config = parseInstallationConfig({
        ...current,
        bindAddress: values.get("--bind") ?? current.bindAddress,
        ports: {
            http: numericOption(values, "--http-port", current.ports.http),
            repository: current.ports.repository,
            provider: current.ports.provider,
        },
        tls,
    });
    if (config.tls.mode === "acme" && config.bindAddress !== "0.0.0.0") {
        throw new Error("ACME TLS requires --bind 0.0.0.0");
    }
    if (tls.mode === "acme" && new Set([...Object.values(config.ports), tls.httpsPort]).size !== 4) {
        throw new Error("HTTP, HTTPS, Repository, and Provider ports must be distinct");
    }
    await saveInstallationConfig(paths, config);
    printConfiguration(config, log);
}

async function hasConfiguredInstance(paths: UlviaPaths): Promise<boolean> {
    const entries = await readdir(paths.instances, { withFileTypes: true });
    for (const entry of entries) {
        if (
            entry.isDirectory() &&
            !entry.isSymbolicLink() &&
            (await loadLocalInstanceConfig(resolveLocalInstancePaths(paths, entry.name).root))
        ) {
            return true;
        }
    }
    return false;
}

function parseOptions(args: readonly string[]): Map<string, string> {
    const allowed = new Set(["--bind", "--http-port", "--https-port", "--tls", "--acme-email"]);
    if (args.length % 2 !== 0) {
        throw new Error(`Usage: ${usage()}`);
    }
    const values = new Map<string, string>();
    for (let index = 0; index < args.length; index += 2) {
        const key = args[index] ?? "";
        const value = args[index + 1]?.trim() ?? "";
        if (!allowed.has(key) || !value || values.has(key)) {
            throw new Error(`Usage: ${usage()}`);
        }
        values.set(key, value);
    }
    const mode = values.get("--tls");
    if (mode && mode !== "disabled" && mode !== "acme") {
        throw new Error("--tls must be disabled or acme");
    }
    return values;
}

function disabledTls(values: ReadonlyMap<string, string>) {
    if (values.has("--https-port") || values.has("--acme-email")) {
        throw new Error("--https-port and --acme-email require --tls acme");
    }
    return { mode: "disabled" } as const;
}

function acmeTls(
    values: ReadonlyMap<string, string>,
    current: Readonly<{ mode: "acme"; email: string; httpsPort: number }> | undefined,
) {
    const email = values.get("--acme-email") ?? current?.email;
    if (!email) {
        throw new Error("--tls acme requires --acme-email");
    }
    return {
        mode: "acme" as const,
        email,
        httpsPort: numericOption(values, "--https-port", current?.httpsPort ?? 443),
    };
}

function numericOption(values: ReadonlyMap<string, string>, name: string, fallback: number): number {
    const raw = values.get(name);
    if (!raw) {
        return fallback;
    }
    const value = Number(raw);
    if (!/^\d+$/u.test(raw) || !Number.isSafeInteger(value) || value < 1 || value > 65_535) {
        throw new Error(`${name} must be an integer between 1 and 65535`);
    }
    return value;
}

function printConfiguration(config: InstallationConfig, log: (message: string) => void): void {
    log(`Bind address: ${config.bindAddress}`);
    log(`HTTP port: ${config.ports.http}`);
    log(`TLS: ${config.tls.mode}`);
    if (config.tls.mode === "acme") {
        log(`HTTPS port: ${config.tls.httpsPort}`);
        log(`ACME email: ${config.tls.email}`);
    }
}

function usage(): string {
    return "ulvia configure network [--bind <127.0.0.1|0.0.0.0>] [--http-port <port>] [--tls <disabled|acme>] [--https-port <port>] [--acme-email <email>]";
}
