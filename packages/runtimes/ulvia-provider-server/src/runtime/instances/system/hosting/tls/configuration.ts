import { isIP } from "node:net";
import { isAbsolute } from "node:path";
import { parseStrictJson } from "@bernouy/ulvia-contracts/protocol";
import { domainHostname } from "@bernouy/hosting";
import type { RuntimeEnvSource } from "../../../../../runtimeEnvParsing";

export interface TlsEntrypoint {
    readonly host: string;
    readonly port: number;
}
export function readTlsConfiguration(source: RuntimeEnvSource, control: { origin: string; local: boolean }) {
    const entrypoints = array(source.ULVIA_TLS_ENTRYPOINTS, 8, "ULVIA_TLS_ENTRYPOINTS").map((value) => {
        if (
            !value ||
            typeof value !== "object" ||
            Array.isArray(value) ||
            Object.keys(value).sort().join(",") !== "host,port" ||
            !("host" in value) ||
            typeof value.host !== "string" ||
            !/^[a-zA-Z0-9.:-]{1,253}$/u.test(value.host) ||
            !("port" in value) ||
            typeof value.port !== "number" ||
            !Number.isSafeInteger(value.port) ||
            value.port < 1 ||
            value.port > 65535
        ) {
            throw new TypeError("ULVIA_TLS_ENTRYPOINTS requires host/port objects");
        }
        return { host: isIP(value.host) ? value.host : domainHostname(value.host), port: value.port };
    });
    const addresses = array(source.ULVIA_TLS_PUBLIC_ADDRESSES, 32, "ULVIA_TLS_PUBLIC_ADDRESSES").map((value) => {
        if (typeof value !== "string" || !isIP(value)) {
            throw new TypeError("ULVIA_TLS_PUBLIC_ADDRESSES requires IP addresses");
        }
        return normalizeAddress(value);
    });
    if (
        new Set(entrypoints.map(({ host, port }) => `${host}:${port}`)).size !== entrypoints.length ||
        new Set(addresses).size !== addresses.length
    ) {
        throw new TypeError("TLS configuration contains duplicate entrypoints or addresses");
    }
    if (
        control.origin.startsWith("https:") &&
        (!entrypoints.length || (!control.local && source.ULVIA_TLS_PUBLIC_ADDRESSES === undefined))
    ) {
        throw new TypeError("HTTPS Control requires TLS entrypoints and explicit public DNS address configuration");
    }
    const trustFile = source.ULVIA_TLS_TRUST_FILE;
    if (trustFile && !isAbsolute(trustFile)) {
        throw new TypeError("ULVIA_TLS_TRUST_FILE must be an absolute path");
    }
    const controlUrl = new URL(control.origin);
    const publicPort = controlUrl.protocol === "https:" ? Number(controlUrl.port || 443) : 443;
    return { entrypoints, addresses, trustFile, localDevelopment: control.local, publicPort };
}
export function normalizeAddress(address: string) {
    return isIP(address) === 6 ? new URL(`http://[${address}]`).hostname : address;
}
function array(value: string | undefined, max: number, name: string): unknown[] {
    const parsed: unknown = value ? parseStrictJson(new TextEncoder().encode(value), 8192, 4) : [];
    if (!Array.isArray(parsed) || parsed.length > max) {
        throw new TypeError(`${name} must contain at most ${max} entries`);
    }
    return parsed;
}
