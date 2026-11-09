import { Resolver } from "node:dns/promises";
import type { HostingDomain } from "@bernouy/hosting";
import { hostingOrigin } from "@bernouy/hosting";
import { normalizeAddress } from "./configuration";

export function domainConfigurationProbe(
    configuration: {
        localDevelopment: boolean;
        addresses: readonly string[];
        entrypoints: readonly unknown[];
        publicPort?: number;
    },
    lookup: (hostname: string) => Promise<readonly string[]> = resolveAddresses,
) {
    const expected = new Set(configuration.addresses);
    return async (domain: HostingDomain): Promise<boolean> => {
        if (!configuration.entrypoints.length) {
            return false;
        }
        if (Number(new URL(domain.origin).port || 443) !== (configuration.publicPort ?? 443)) {
            return false;
        }
        if (hostingOrigin(domain.origin).local) {
            return configuration.localDevelopment;
        }
        if (!expected.size) {
            return false;
        }
        const addresses = await lookup(domain.hostname);
        return (
            addresses.length > 0 &&
            addresses.length <= 32 &&
            addresses.every((address) => expected.has(normalizeAddress(address)))
        );
    };
}

async function resolveAddresses(hostname: string): Promise<readonly string[]> {
    const resolver = new Resolver({ timeout: 2000, tries: 2 });
    const timeout = setTimeout(() => resolver.cancel(), 5000);
    const resolve = async (family: 4 | 6) => {
        try {
            return await (family === 4 ? resolver.resolve4(hostname) : resolver.resolve6(hostname));
        } catch (cause) {
            if (
                cause &&
                typeof cause === "object" &&
                "code" in cause &&
                ["ENODATA", "ENOTFOUND"].includes(String(cause.code))
            ) {
                return [];
            }
            throw cause;
        }
    };
    try {
        return (await Promise.all([resolve(4), resolve(6)])).flat();
    } finally {
        clearTimeout(timeout);
        resolver.cancel();
    }
}
