import { expect, test } from "bun:test";
import {
    readTlsConfiguration,
    normalizeAddress,
} from "../../../src/runtime/instances/system/hosting/tls/configuration";
import { domainConfigurationProbe } from "../../../src/runtime/instances/system/hosting/tls/dns";
import type { HostingDomain } from "@bernouy/hosting";

const domain: HostingDomain = {
    hostname: "site.example",
    origin: "https://site.example",
    instanceId: "instance:one",
    claimId: crypto.randomUUID(),
    creationFingerprint: null,
    state: "verified",
    tls: "pending",
    revision: 1,
};
test("TLS DNS verification requires every A/AAAA address to belong to the configured installation", async () => {
    const configuration = {
        localDevelopment: false,
        entrypoints: [{}],
        addresses: ["192.0.2.1", normalizeAddress("2001:db8::1")],
    };
    for (const [addresses, allowed] of [
        [["192.0.2.1"], true],
        [["192.0.2.1", "2001:db8::1"], true],
        [["192.0.2.1", "192.0.2.2"], false],
        [[], false],
        [Array(33).fill("192.0.2.1"), false],
    ] as const) {
        expect(await domainConfigurationProbe(configuration, async () => addresses)(domain)).toBe(allowed);
    }
    const local = { ...domain, hostname: "site.localhost", origin: "https://site.localhost" };
    expect(
        await domainConfigurationProbe(configuration, async () => ["192.0.2.1"])({
            ...domain,
            origin: "https://site.example:8443",
        }),
    ).toBe(false);
    expect(
        await domainConfigurationProbe({ ...configuration, publicPort: 8443 }, async () => ["192.0.2.1"])({
            ...domain,
            origin: "https://site.example:8443",
        }),
    ).toBe(true);
    expect(
        await domainConfigurationProbe(configuration, async () => {
            throw new Error("DNS must not run");
        })(local),
    ).toBe(false);
    expect(await domainConfigurationProbe({ ...configuration, localDevelopment: true })(local)).toBe(true);
});
test("HTTPS startup requires explicit bounded entrypoints, public addresses and an absolute trust file", () => {
    const control = { origin: "https://control.example", local: false };
    expect(() => readTlsConfiguration({}, control)).toThrow("HTTPS Control");
    const valid = {
        ULVIA_TLS_ENTRYPOINTS: '[{"host":"proxy","port":443}]',
        ULVIA_TLS_PUBLIC_ADDRESSES: '["192.0.2.1"]',
    };
    expect(readTlsConfiguration(valid, control).entrypoints).toEqual([{ host: "proxy", port: 443 }]);
    for (const patch of [
        { ULVIA_TLS_ENTRYPOINTS: '[{"host":"proxy/path","port":443}]' },
        { ULVIA_TLS_ENTRYPOINTS: '[{"host":"proxy","port":0}]' },
        { ULVIA_TLS_ENTRYPOINTS: '[{"host":"proxy","port":443,"secret":"no"}]' },
        { ULVIA_TLS_PUBLIC_ADDRESSES: '["site.example"]' },
        { ULVIA_TLS_TRUST_FILE: "relative.pem" },
    ]) {
        expect(() => readTlsConfiguration({ ...valid, ...patch }, control)).toThrow();
    }
});
