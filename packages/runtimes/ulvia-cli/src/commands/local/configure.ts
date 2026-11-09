import type { UlviaPaths } from "../../runtime/paths";
import { domainHostname } from "@bernouy/hosting";
import {
    assertFreshInstallation,
    defaultInstallationConfig,
    loadInstallationConfig,
    parseInstallationConfig,
    saveInstallationConfig,
} from "../../runtime/stack/installation";
import type { InstallationConfig } from "../../runtime/stack/installation";
import { instancePublicUrl } from "../../runtime/stack/ports";
import { loadLocalServicesState } from "../../runtime/stack/orchestration/state";

export async function configureCommand(
    args: readonly string[],
    paths: UlviaPaths,
    environment: Record<string, string | undefined>,
    log: (message: string) => void,
): Promise<void> {
    const [area, ...rest] = args;
    if (area !== "network" && area !== "hosting") {
        throw new Error(usage());
    }
    let current = await loadInstallationConfig(paths);
    if (!current) {
        await assertFreshInstallation(paths);
        current = defaultInstallationConfig(environment);
    }
    if (!rest.length) {
        printConfiguration(current, log);
        return;
    }
    const values = parseOptions(
        rest,
        area === "network"
            ? ["--bind", "--http-port", "--https-port", "--tls", "--acme-email"]
            : ["--domain", "--edges", "--managed-suffixes", "--public-addresses"],
    );
    const state = await loadLocalServicesState(paths);
    if (state && area === "network") {
        throw new Error("Network configuration is locked after the first infrastructure start");
    }
    let next: InstallationConfig = current;
    if (area === "network") {
        const mode = values.get("--tls") ?? current.tls.mode;
        if (!["disabled", "acme"].includes(mode)) {
            throw new Error("--tls must be disabled or acme");
        }
        const prior = current.tls.mode === "acme" ? current.tls : undefined;
        const email = values.get("--acme-email") ?? prior?.email;
        if (mode === "acme" && !email) {
            throw new Error("--tls acme requires --acme-email");
        }
        if (mode === "disabled" && (values.has("--https-port") || values.has("--acme-email"))) {
            throw new Error("HTTPS options require --tls acme");
        }
        const tls =
            mode === "disabled"
                ? { mode: "disabled" as const }
                : {
                      mode: "acme" as const,
                      email: email!,
                      httpsPort: numeric(values, "--https-port", prior?.httpsPort ?? 443),
                  };
        const ports = { ...current.ports, http: numeric(values, "--http-port", current.ports.http) };
        const bindAddress = values.get("--bind") ?? current.bindAddress;
        if (mode === "acme" && bindAddress !== "0.0.0.0") {
            throw new Error("ACME TLS requires --bind 0.0.0.0");
        }
        if (tls.mode === "acme" && new Set([...Object.values(ports), tls.httpsPort]).size !== 3) {
            throw new Error("HTTP, HTTPS and Provider ports must be distinct");
        }
        next = parseInstallationConfig({
            ...current,
            bindAddress,
            ports,
            tls,
            hosting: {
                ...current.hosting,
                controlOrigin: instancePublicUrl(new URL(current.hosting.controlOrigin).hostname, { ports, tls }),
            },
        });
    } else {
        const hostname = values.has("--domain")
            ? domainHostname(values.get("--domain")!)
            : new URL(current.hosting.controlOrigin).hostname;
        const origin = instancePublicUrl(hostname, current);
        if (state && origin !== state.installation.hosting.controlOrigin) {
            throw new Error("Control origin cannot change after the first infrastructure start");
        }
        next = parseInstallationConfig({
            ...current,
            hosting: {
                ...current.hosting,
                controlOrigin: origin,
                edgeCount: numeric(values, "--edges", current.hosting.edgeCount),
                managedSuffixes: values.has("--managed-suffixes")
                    ? list(values.get("--managed-suffixes")!).map(domainHostname)
                    : current.hosting.managedSuffixes,
                publicAddresses: values.has("--public-addresses")
                    ? list(values.get("--public-addresses")!)
                    : current.hosting.publicAddresses,
            },
        });
    }
    await saveInstallationConfig(paths, next);
    printConfiguration(next, log);
}
function parseOptions(args: readonly string[], allowed: readonly string[]) {
    const values = new Map<string, string>();
    if (args.length % 2) {
        throw new Error(usage());
    }
    for (let index = 0; index < args.length; index += 2) {
        const key = args[index]!;
        const value = args[index + 1]?.trim();
        if (!allowed.includes(key) || !value || values.has(key)) {
            throw new Error(usage());
        }
        values.set(key, value);
    }
    return values;
}
function numeric(values: ReadonlyMap<string, string>, name: string, fallback: number) {
    const raw = values.get(name);
    if (!raw) {
        return fallback;
    }
    if (!/^\d+$/u.test(raw)) {
        throw new Error(`${name} must be an integer`);
    }
    return Number(raw);
}
function list(value: string) {
    return value.split(",").map((part) => part.trim());
}
function printConfiguration(config: InstallationConfig, log: (message: string) => void) {
    log(`Bind address: ${config.bindAddress}`);
    log(`HTTP port: ${config.ports.http}`);
    log(`TLS: ${config.tls.mode}`);
    if (config.tls.mode === "acme") {
        log(`HTTPS port: ${config.tls.httpsPort}`);
        log(`ACME email: ${config.tls.email}`);
    }
    log(`Control: ${config.hosting.controlOrigin}`);
    log(`Shared Edges: ${config.hosting.edgeCount}`);
    log(`Public addresses: ${config.hosting.publicAddresses.join(", ") || "pending configuration"}`);
}
function usage() {
    return "Usage: ulvia configure <network | hosting> [--domain <hostname>] [--edges <1..16>] [--public-addresses <ip,ip>] [network options]";
}
