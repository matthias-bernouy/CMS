import { expect, test } from "bun:test";
import { environmentProfile } from "../../measurements/provenance";
import { buildDnsProgram } from "./container";

test("controlled service code and resource limits are sealed into the immutable environment profile", async () => {
    const built = await buildDnsProgram();
    expect(built.profile.programDigest).toMatch(/^[a-f0-9]{64}$/u);
    expect(built.program.length).toBeGreaterThan(1000);
    const services = { dns: { ...built.profile } };
    const profile = environmentProfile("probe", services);
    expect(profile.fingerprint).not.toBe(environmentProfile("probe").fingerprint);
    services.dns.cpus = 0.5;
    expect(profile.services?.dns?.cpus).toBe(0.25);
    expect(profile.fingerprint).not.toBe(environmentProfile("probe", services).fingerprint);
    expect(profile.fingerprint).not.toBe(
        environmentProfile("probe", { dns: { ...built.profile, programDigest: "b".repeat(64) } }).fingerprint,
    );
});
