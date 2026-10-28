import { expect, test } from "bun:test";
import { createNativeInvocationAuthorizer } from "../../src/runtime/gateway/nativeAuthorization";
import type { ProviderRuntimeReport } from "@bernouy/cms-repository/providers/installations";
import type { ProviderInvocationClaims } from "@bernouy/cms-gateway/protocol";

const digest = `sha256:${"a".repeat(64)}`;
function fixture(onInstallationRead: () => void = () => {}, concreteContract = "ulvia.cms.content") {
    let revision = 1;
    const report: ProviderRuntimeReport = {
        protocol: "ulvia-provider/v1",
        providerId: "ulvia.official",
        instanceId: "instance:one",
        account: { id: "instance:one", label: "One" },
        buildVersion: "1.0.0",
        manifest: { version: "0.1.0", digest: digest as `sha256:${string}` },
        implementations: [
            {
                contractId: concreteContract,
                version: "1.0.0",
                digest: digest as `sha256:${string}`,
                status: "ready",
            },
        ],
    };
    const selection = {
        siteId: "site",
        contractId: concreteContract,
        version: "1.0.0",
        digest,
        installationId: "native",
    };
    const grants = { default: "allow-selected", denied: [] as { contractId: string; capabilityId: string }[] };
    const installation = {
        status: "enabled",
        providerId: "ulvia.official",
        accountId: "instance:one",
        endpoint: "https://original.test",
    };
    const authorize = createNativeInvocationAuthorizer(
        "site",
        report,
        { get: async () => structuredClone({ revision, grants, plan: { selections: [selection] } }) } as never,
        {
            get: async ({ installationId }: { installationId: string }) => {
                onInstallationRead();
                return installationId === "native"
                    ? { installation, observation: { report } }
                    : {
                          installation: { ...installation, providerId: "remote", accountId: "remote" },
                          observation: { report: { ...report, instanceId: "remote" } },
                      };
            },
        } as never,
        {
            resolve: async () => ({
                selection,
                installation: { installation: structuredClone(installation) },
                requestedRelease: { admission: { release: { contractId: "ulvia.cms.content", version: "1.0.0" } } },
            }),
        } as never,
    );
    const claims = {
        instanceId: report.instanceId,
        connectionId: "native",
        contractId: "ulvia.cms.content",
        contractVersion: selection.version,
        capabilityId: "site.get",
    } as ProviderInvocationClaims;
    return {
        authorize,
        claims,
        selection,
        installation,
        grants,
        bumpRevision: () => {
            revision++;
        },
    };
}

test("issued native tokens lose authority when the same release is redirected to another Provider", async () => {
    const f = fixture();
    expect(await f.authorize(f.claims)).toBe(true);
    f.selection.installationId = "external";
    expect(await f.authorize(f.claims)).toBe(false);
});

test("native authorization rechecks exact digests, installation status and current site grants", async () => {
    const f = fixture();
    f.selection.digest = `sha256:${"b".repeat(64)}`;
    expect(await f.authorize(f.claims)).toBe(false);
    f.selection.digest = digest;
    f.installation.status = "disabled";
    expect(await f.authorize(f.claims)).toBe(false);
    f.installation.status = "enabled";
    f.grants.denied.push({ contractId: f.selection.contractId, capabilityId: f.claims.capabilityId });
    expect(await f.authorize(f.claims)).toBe(false);
    f.grants.denied.length = 0;
    expect(await f.authorize({ ...f.claims, instanceId: "instance:other" })).toBe(false);
    expect(await f.authorize(f.claims)).toBe(true);
});

test("a route change during installation lookup rejects the stale authorization snapshot", async () => {
    let changeRevision = () => {};
    const f = fixture(() => changeRevision());
    changeRevision = f.bumpRevision;
    expect(await f.authorize(f.claims)).toBe(false);
});

test("a base contract call retains the selected specialization's native authority", async () => {
    const f = fixture(undefined, "ulvia.cms.content.specialized");
    expect(await f.authorize(f.claims)).toBe(true);
    f.grants.denied.push({ contractId: f.selection.contractId, capabilityId: f.claims.capabilityId });
    expect(await f.authorize(f.claims)).toBe(false);
});

test("an unrelated concurrent upgrade retries authorization against a stable fresh snapshot", async () => {
    let mutate = () => {};
    const f = fixture(() => mutate());
    mutate = () => {
        f.bumpRevision();
        mutate = () => {};
    };
    expect(await f.authorize(f.claims)).toBe(true);
});

test("a retry never restores authority after the destination changes during authorization", async () => {
    let mutate = () => {};
    const f = fixture(() => mutate());
    mutate = () => {
        f.selection.installationId = "external";
        f.bumpRevision();
        mutate = () => {};
    };
    expect(await f.authorize(f.claims)).toBe(false);
});

test("a same-instance same-version installation redirect cannot reuse a token for its previous connection", async () => {
    const f = fixture();
    expect(await f.authorize({ ...f.claims, connectionId: "another-installation" })).toBe(false);
    expect(await f.authorize({ ...f.claims, connectionId: undefined })).toBe(false);
});

test("the receiver rejects installation changes after its initial route read even when the selection revision is unchanged", async () => {
    let mutate = () => {};
    const f = fixture(() => mutate());
    mutate = () => {
        f.installation.endpoint = "https://changed.test";
    };
    expect(await f.authorize(f.claims)).toBe(false);
});
