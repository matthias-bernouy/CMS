import { expect, test } from "bun:test";
import { admitContractRelease } from "@bernouy/cms-repository/contracts";
import type { ContractRelease } from "@bernouy/cms-repository/contracts";
import type { ProviderInstallationCandidate } from "@bernouy/cms-repository/providers/installations";
import type { ProviderManagementGateway } from "@bernouy/cms-repository/providers/management";
import { compatibleTransitionRetention } from "../../../src/runtime/stores/collections/compatibleRetention";
import { loadOfficialArtifacts } from "../../../src/runtime/instances/profiles/artifacts";
import { repositoryFixture } from "./fixture";

let base:
    | Promise<{
          repository: Awaited<ReturnType<typeof repositoryFixture>>;
          profiles: Awaited<ReturnType<typeof loadOfficialArtifacts>>;
      }>
    | undefined;
async function baseFixture() {
    const repository = await repositoryFixture(true);
    return { repository, profiles: await loadOfficialArtifacts(repository.providers, repository.collections) };
}

async function fixture(change: (release: ContractRelease) => ContractRelease = (value) => value) {
    const { repository: f, profiles } = await (base ??= baseFixture());
    const before = profiles.profiles[0]!.contracts.find(({ contractId }) => contractId === "ulvia.cms.observability")!;
    const source = f.contracts.find(
        ({ release }) => release.contractId === before.contractId && release.version === "1.1.0",
    )!;
    const admission = await admitContractRelease(change(source.release));
    const after = {
        contractId: admission.release.contractId,
        version: admission.release.version,
        digest: admission.digest,
    };
    const gateway = {
        siteId: "default",
        releases: {
            ...f.catalogue,
            get: async (id: string, version: string) =>
                id === after.contractId && version === after.version
                    ? { admission, publishedAt: "2026-10-28T00:00:00Z" }
                    : f.catalogue.get(id, version),
        },
    } as unknown as ProviderManagementGateway;
    const target = {
        ...profiles.defaultProfile,
        contracts: profiles.defaultProfile.contracts.map((pin) => (pin.contractId === after.contractId ? after : pin)),
    };
    const candidate: ProviderInstallationCandidate = {
        id: "official",
        siteId: "default",
        providerId: target.manifest.providerId,
        accountId: "instance:one",
        endpoint: "https://provider.example",
        manifestVersion: target.manifest.version,
        manifestDigest: target.manifest.digest,
        providerTokenRef: "${PROVIDER}",
        configuration: {},
    };
    const abort = new AbortController();
    let pending = false;
    let complete = true;
    const retention = compatibleTransitionRetention(
        {
            snapshot: async () => ({
                complete,
                revision: "one",
                releases: [{ ...before, location: pending ? "transition:pending/target" : "site:default/selection" }],
            }),
            isCurrent: async () => true,
        },
        gateway,
        candidate.accountId,
        target,
        { signal: abort.signal, throwIfLeaseLost: () => abort.signal.throwIfAborted() },
    );
    return {
        before,
        after,
        candidate,
        retention,
        abort,
        setUnknown: () => {
            complete = false;
        },
        setPending: () => {
            pending = true;
        },
    };
}

test("a compatible admitted minor release replaces the selected release during the fenced transition", async () => {
    const f = await fixture();
    expect(await f.retention.canReplace!(f.candidate, f.before, f.after)).toBe(true);
    expect(await f.retention.canReplace!({ ...f.candidate, siteId: "other" }, f.before, f.after)).toBe(false);
    expect(await f.retention.canReplace!({ ...f.candidate, accountId: "instance:other" }, f.before, f.after)).toBe(
        false,
    );
    expect(await f.retention.canReplace!({ ...f.candidate, manifestDigest: f.before.digest }, f.before, f.after)).toBe(
        false,
    );
    expect(await f.retention.canReplace!(f.candidate, { ...f.before, digest: f.after.digest }, f.after)).toBe(false);
    f.setPending();
    expect(await f.retention.canReplace!(f.candidate, f.before, f.after)).toBe(false);
});

test("SemVer alone does not authorize changed access, input bounds, HTTP routes or a new major", async () => {
    const changes: ((release: ContractRelease) => ContractRelease)[] = [
        (release) => ({ ...release, version: "2.0.0" }),
        (release) => ({
            ...release,
            capabilities: release.capabilities.map((capability) => ({ ...capability, access: "public" })),
        }),
        (release) => ({
            ...release,
            capabilities: release.capabilities.map((capability) =>
                capability.id === "logs.query"
                    ? { ...capability, input: { ...capability.input, required: ["limit"] } }
                    : capability,
            ),
        }),
        (release) => ({
            ...release,
            capabilities: release.capabilities.map((capability) => ({
                ...capability,
                bindings: capability.bindings.map((binding) =>
                    binding.transport === "http" ? { ...binding, path: `/changed${binding.path}` } : binding,
                ),
            })),
        }),
    ];
    for (const change of changes) {
        const f = await fixture(change);
        expect(await f.retention.canReplace!(f.candidate, f.before, f.after)).toBe(false);
    }
});

test("a lost transition lease revokes replacement authority and the final revision check", async () => {
    const f = await fixture();
    f.setUnknown();
    expect(await f.retention.canReplace!(f.candidate, f.before, f.after)).toBe(false);
    f.abort.abort(new Error("Lease lost"));
    await expect(f.retention.canReplace!(f.candidate, f.before, f.after)).rejects.toThrow("Lease lost");
    await expect(f.retention.isCurrent({ siteId: "default", installationId: "official" }, "one")).rejects.toThrow(
        "Lease lost",
    );
});
