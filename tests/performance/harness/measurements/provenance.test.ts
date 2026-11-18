import { expect, test } from "bun:test";
import { environmentProfile } from "./provenance";
import type { EnvironmentProfile } from "../../reporting/types";

test("exact retained pins and synthetic Provider identities separate timing comparison profiles", () => {
    const bootstrap = {
        pin: { contractId: "ulvia/cms.content", version: "1.0.0", digest: `sha256:${"1".repeat(64)}` as const },
        providerDigest: `sha256:${"2".repeat(64)}`,
    } satisfies NonNullable<EnvironmentProfile["bootstrap"]>;
    const official = environmentProfile("instrumentation");
    const first = environmentProfile("instrumentation", undefined, bootstrap);
    expect(first.fingerprint).not.toBe(official.fingerprint);
    expect(first.fingerprint).toBe(environmentProfile("instrumentation", undefined, bootstrap).fingerprint);
    expect(first.bootstrap).toEqual(bootstrap);
    const alternatives: NonNullable<EnvironmentProfile["bootstrap"]>[] = [
        { ...bootstrap, providerDigest: `sha256:${"3".repeat(64)}` },
        { ...bootstrap, pin: { ...bootstrap.pin, digest: `sha256:${"4".repeat(64)}` } },
        { ...bootstrap, pin: { ...bootstrap.pin, version: "1.0.1" } },
    ];
    for (const changed of alternatives) {
        expect(environmentProfile("instrumentation", undefined, changed).fingerprint).not.toBe(first.fingerprint);
    }
    bootstrap.pin.version = "changed-after-profile-capture";
    expect(first.bootstrap?.pin.version).toBe("1.0.0");
    expect(official.bootstrap).toBeUndefined();
});
