import { grantedAuthority } from "../../../../src/providers/selections/core/authority/grants";
import { admitProviderManifest } from "@bernouy/cms-repository/providers";
import { expect, test } from "bun:test";
import { planContractSelections } from "@bernouy/cms-repository/providers/selections";
import { previewProviderAuthority } from "../../../../src/providers/selections/core/authority/preview";
import { graphFixture, siteId } from "../fixtures";

test("connection preview excludes denied source and target capabilities", async () => {
    const f = await graphFixture();
    const stored = (await f.manifests.get(f.installation.providerId, f.installation.approval.manifestVersion))!;
    const manifest = {
        ...stored.admission.manifest,
        implementations: stored.admission.manifest.implementations.map((item) => ({
            ...item,
            delegation: { sources: ["*"], allow: [{ contractId: "*", capabilityId: "*", effect: "*" as const }] },
        })),
    };
    const current = {
        siteId,
        revision: 1,
        dependencyRevision: "state-1",
        grants: { default: "allow-selected" as const, denied: [] as { contractId: string; capabilityId: string }[] },
        plan: await planContractSelections(siteId, [await f.select("commerce"), await f.select("payment")], f.context),
    };
    const allowed = await previewProviderAuthority(manifest, current, f.releases);
    expect(allowed.delegation.matches.some((pair) => pair.targetContractId === "payment")).toBeTrue();
    current.grants.denied.push({ contractId: "payment", capabilityId: "pay" });
    const denied = await previewProviderAuthority(manifest, current, f.releases);
    expect(
        denied.delegation.matches.some(
            (pair) => pair.targetContractId === "payment" || pair.sourceContractId === "payment",
        ),
    ).toBeFalse();
    expect(denied.authorityDigest).not.toBe(allowed.authorityDigest);
});

test("review inventories retain each exact capability once across wildcard pairs", async () => {
    const f = await graphFixture();
    const old = (await f.manifests.get(f.installation.providerId, f.installation.approval.manifestVersion))!;
    const next = await admitProviderManifest(
        {
            ...old.admission.manifest,
            version: "1.1.0",
            implementations: old.admission.manifest.implementations.map((item) => ({
                ...item,
                delegation: { sources: ["*"], allow: [{ contractId: "*", capabilityId: "*", effect: "*" }] },
            })),
        },
        f.releases,
    );
    await f.manifests.publish(next);
    const installed = {
        ...f.installation,
        approval: { ...f.installation.approval, manifestVersion: "1.1.0", manifestDigest: next.digest },
    };
    const plan = await planContractSelections(
        siteId,
        [await f.select("commerce"), await f.select("payment"), await f.select("emailer")],
        { ...f.context, installations: [installed] },
    );
    const { authority } = plan;
    expect(authority.capabilities).toHaveLength(3);
    expect(authority.delegated).toHaveLength(9);
    const expanded = {
        ...authority,
        delegated: authority.delegated.map((entry) => ({
            source: authority.capabilities[entry.source],
            target: authority.capabilities[entry.target],
        })),
    };
    expect(JSON.stringify(authority).length).toBeLessThan(JSON.stringify(expanded).length / 2);
    const effective = grantedAuthority(authority, {
        default: "allow-selected",
        denied: [{ contractId: "payment", capabilityId: "pay" }],
    });
    expect(effective.capabilities.some((entry) => entry.contractId === "payment")).toBeFalse();
    expect(effective.delegated).toHaveLength(4);
    for (const entry of effective.delegated) {
        expect(effective.capabilities[entry.source]).toBeDefined();
        expect(effective.capabilities[entry.target]).toBeDefined();
    }
    for (const entry of authority.delegated) {
        expect(authority.capabilities[entry.source]).toBeDefined();
        expect(authority.capabilities[entry.target]).toBeDefined();
    }
});
