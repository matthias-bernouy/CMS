import { isIP } from "node:net";
import { domainHostname, hostingOrigin } from "@bernouy/hosting";

export type InstallationHosting = Readonly<{
    controlOrigin: string;
    edgeCount: number;
    managedSuffixes: readonly string[];
    publicAddresses: readonly string[];
}>;

export function parseHosting(value: unknown): InstallationHosting {
    if (
        !value ||
        typeof value !== "object" ||
        Array.isArray(value) ||
        Object.keys(value).sort().join(",") !== "controlOrigin,edgeCount,managedSuffixes,publicAddresses"
    ) {
        throw new Error("Ulvia shared hosting configuration is missing or incompatible");
    }
    const record = value as Record<string, unknown>;
    if (
        typeof record.controlOrigin !== "string" ||
        hostingOrigin(record.controlOrigin).origin !== record.controlOrigin ||
        !Number.isSafeInteger(record.edgeCount) ||
        Number(record.edgeCount) < 1 ||
        Number(record.edgeCount) > 16 ||
        !Array.isArray(record.managedSuffixes) ||
        record.managedSuffixes.length > 16 ||
        !Array.isArray(record.publicAddresses) ||
        record.publicAddresses.length > 32 ||
        record.publicAddresses.some((address) => typeof address !== "string" || !isIP(address))
    ) {
        throw new Error("Ulvia shared hosting configuration is invalid");
    }
    const managedSuffixes = record.managedSuffixes.map((value) => {
        if (typeof value !== "string" || domainHostname(value) !== value) {
            throw new Error("Managed DNS suffix is invalid");
        }
        return value;
    });
    if (
        new Set(managedSuffixes).size !== managedSuffixes.length ||
        new Set(record.publicAddresses).size !== record.publicAddresses.length
    ) {
        throw new Error("Hosting suffixes and public addresses must be distinct");
    }
    return Object.freeze({
        controlOrigin: record.controlOrigin,
        edgeCount: Number(record.edgeCount),
        managedSuffixes: Object.freeze(managedSuffixes),
        publicAddresses: Object.freeze([...record.publicAddresses]),
    });
}
