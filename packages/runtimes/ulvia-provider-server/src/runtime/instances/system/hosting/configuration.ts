import { privateProxyOrigin } from "./transport/HostedTransport";
import { assertProviderInvocationSecret } from "@bernouy/cms-gateway/protocol";
import { open } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { domainHostname, hostingOrigin } from "@bernouy/hosting";
import { parseStrictJson } from "@bernouy/ulvia-contracts/protocol";
import type { ProviderInstanceAdministrator } from "@bernouy/hosting/instances";
import type { RuntimeEnvSource } from "../../../../runtimeEnvParsing";
import { readTlsConfiguration } from "./tls/configuration";

export function readHostingConfiguration(source: RuntimeEnvSource) {
    if (!source.ULVIA_CONTROL_ORIGIN) {
        throw new TypeError("ULVIA_CONTROL_ORIGIN is required");
    }
    const control = hostingOrigin(source.ULVIA_CONTROL_ORIGIN);
    const edgeSecret = source.ULVIA_EDGE_ROUTING_SECRET;
    if (!edgeSecret) {
        throw new TypeError("ULVIA_EDGE_ROUTING_SECRET is required");
    }
    assertProviderInvocationSecret(edgeSecret);
    let suffixes: unknown = [];
    try {
        if (source.ULVIA_HOSTING_MANAGED_SUFFIXES) {
            suffixes = parseStrictJson(new TextEncoder().encode(source.ULVIA_HOSTING_MANAGED_SUFFIXES), 8192, 2);
        }
    } catch {
        throw new TypeError("ULVIA_HOSTING_MANAGED_SUFFIXES must be a bounded JSON array of DNS suffixes");
    }
    if (!Array.isArray(suffixes) || suffixes.length > 16 || suffixes.some((value) => typeof value !== "string")) {
        throw new TypeError("ULVIA_HOSTING_MANAGED_SUFFIXES must contain at most 16 DNS suffixes");
    }
    const bootstrapFile = source.ULVIA_CONTROL_BOOTSTRAP_FILE;
    if (bootstrapFile && !isAbsolute(bootstrapFile)) {
        throw new TypeError("ULVIA_CONTROL_BOOTSTRAP_FILE must be an absolute path");
    }
    return {
        origin: control.origin,
        ...(source.ULVIA_HOSTING_PROXY_URL
            ? { proxyUrl: privateProxyOrigin(source.ULVIA_HOSTING_PROXY_URL).origin }
            : {}),
        edgeSecret,
        localDevelopment: control.local,
        managedSuffixes: suffixes.map(domainHostname),
        bootstrapFile,
        tls: readTlsConfiguration(source, control),
    };
}

/** Read only for unfinished bootstrap. Restarting ready Control does not require this file. */
export async function readControlAdministrator(
    path: string | undefined,
): Promise<ProviderInstanceAdministrator | undefined> {
    if (!path) {
        return undefined;
    }
    const file = await open(path, "r");
    try {
        const metadata = await file.stat();
        if (!metadata.isFile() || metadata.size > 4096) {
            throw new TypeError("Control bootstrap credentials must be a JSON file of at most 4096 bytes");
        }
        const bytes = Buffer.alloc(4097);
        const { bytesRead } = await file.read(bytes);
        const value = parseStrictJson(bytes.subarray(0, bytesRead), 4096, 2);
        if (
            !value ||
            typeof value !== "object" ||
            Array.isArray(value) ||
            Object.keys(value).sort().join(",") !== "email,password" ||
            !("email" in value) ||
            typeof value.email !== "string" ||
            !("password" in value) ||
            typeof value.password !== "string"
        ) {
            throw new TypeError("Control bootstrap credentials require exactly email and password");
        }
        return { email: value.email, password: value.password };
    } finally {
        await file.close();
    }
}
