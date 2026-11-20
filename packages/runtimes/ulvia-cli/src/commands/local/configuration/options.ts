import { domainHostname } from "@bernouy/hosting";
import { instancePublicUrl } from "../../../runtime/stack/ports";
import { parseInstallationConfig } from "../../../runtime/stack/installation";
import type { InstallationConfig } from "../../../runtime/stack/installation";
import { configuredCaptureConnection } from "../../../runtime/stack/captures/configuration";

export const CONFIGURE_USAGE =
    "Usage: ulvia configure [--show | --domain <hostname> --edges <1..16> --bind <address> --http-port <port> --tls <disabled|acme> --https-port <port> --acme-email <email> --managed-suffixes <dns,dns> --public-addresses <ip,ip> --capture-socket-directory <path|disabled> --capture-group <gid>]";
export function configureOptions(args: readonly string[]): Map<string, string> {
    const allowed = [
        "--domain",
        "--edges",
        "--bind",
        "--http-port",
        "--tls",
        "--https-port",
        "--acme-email",
        "--managed-suffixes",
        "--public-addresses",
        "--capture-socket-directory",
        "--capture-group",
    ];
    const result = new Map<string, string>();
    if (args.length % 2) {
        throw new Error(CONFIGURE_USAGE);
    }
    for (let i = 0; i < args.length; i += 2) {
        const key = args[i]!;
        const value = args[i + 1]?.trim();
        if (
            !allowed.includes(key) ||
            value === undefined ||
            (!value && !["--managed-suffixes", "--public-addresses"].includes(key)) ||
            result.has(key)
        ) {
            throw new Error(CONFIGURE_USAGE);
        }
        result.set(key, value);
    }
    return result;
}
export function configuredInstallation(
    current: InstallationConfig,
    values: ReadonlyMap<string, string>,
    locked: boolean,
): InstallationConfig {
    const network = ["--bind", "--http-port", "--tls", "--https-port", "--acme-email"];
    if (locked && network.some((name) => values.has(name))) {
        throw new Error("Network configuration is locked after the first deployment");
    }
    const numeric = (name: string, fallback: number) => {
        const value = values.get(name);
        if (value === undefined) {
            return fallback;
        }
        if (!/^[0-9]+$/u.test(value)) {
            throw new Error(`${name} requires an integer`);
        }
        return Number(value);
    };
    const mode = values.get("--tls") ?? current.tls.mode;
    if (mode !== "disabled" && mode !== "acme") {
        throw new Error("--tls must be disabled or acme");
    }
    if (mode === "disabled" && (values.has("--https-port") || values.has("--acme-email"))) {
        throw new Error("HTTPS options require --tls acme");
    }
    const prior = current.tls.mode === "acme" ? current.tls : undefined;
    const tls =
        mode === "disabled"
            ? { mode: "disabled" as const }
            : {
                  mode: "acme" as const,
                  email: values.get("--acme-email") ?? prior?.email ?? "",
                  httpsPort: numeric("--https-port", prior?.httpsPort ?? 443),
              };
    const ports = { ...current.ports, http: numeric("--http-port", current.ports.http) };
    const bindAddress = values.get("--bind") ?? current.bindAddress;
    if (tls.mode === "acme" && bindAddress !== "0.0.0.0") {
        throw new Error("ACME TLS requires --bind 0.0.0.0");
    }
    if (tls.mode === "acme" && new Set([...Object.values(ports), tls.httpsPort]).size !== 3) {
        throw new Error("HTTP, HTTPS and Provider ports must be distinct");
    }
    const domain = values.has("--domain")
        ? domainHostname(values.get("--domain")!)
        : new URL(current.hosting.controlOrigin).hostname;
    const controlOrigin = instancePublicUrl(domain, { ports, tls });
    if (locked && controlOrigin !== current.hosting.controlOrigin) {
        throw new Error("Control origin cannot change after the first deployment");
    }
    const list = (name: string, fallback: readonly string[]) =>
        values.has(name)
            ? values.get(name)
                ? values
                      .get(name)!
                      .split(",")
                      .map((part) => part.trim())
                : []
            : fallback;
    const { capture: priorCapture, ...base } = current;
    const capture = configuredCaptureConnection(priorCapture, values);
    return parseInstallationConfig({
        ...base,
        ...(capture ? { capture } : {}),
        bindAddress,
        ports,
        tls,
        hosting: {
            ...current.hosting,
            controlOrigin,
            edgeCount: numeric("--edges", current.hosting.edgeCount),
            managedSuffixes: list("--managed-suffixes", current.hosting.managedSuffixes).map(domainHostname),
            publicAddresses: list("--public-addresses", current.hosting.publicAddresses),
        },
    });
}
