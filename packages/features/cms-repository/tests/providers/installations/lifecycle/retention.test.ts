import { expect, test } from "bun:test";
import { installationWorkflow } from "./fixtures";
import { contractDocument, implementation } from "../../support/fixtures";
import { admitContractRelease } from "@bernouy/cms-repository/contracts";
import { admitProviderManifest } from "@bernouy/cms-repository/providers";
import type { ProviderReleaseRetention } from "@bernouy/cms-repository/providers/installations";

async function fixture(retention?: ProviderReleaseRetention) {
    const f = await installationWorkflow({ retention });
    await f.approve();
    const release = await admitContractRelease(contractDocument("payment", "create-link", "2.0.0"));
    await f.contracts.publish(release);
    const next = await admitProviderManifest(
        { ...f.manifest, version: "2.0.0", implementations: [implementation("payment", "2.0.0", release.digest)] },
        f.contracts,
    );
    await f.catalogue.publish(next);
    const report = {
        ...f.report,
        manifest: { version: next.manifest.version, digest: next.digest },
        implementations: [{ contractId: "payment", version: "2.0.0", digest: release.digest, status: "ready" }],
    };
    return {
        ...f,
        next,
        prepare: () =>
            f.lifecycle.prepareModification(
                f.scope,
                1,
                { manifestVersion: next.manifest.version, manifestDigest: next.digest },
                report,
            ),
    };
}

test("manifest release removal fails closed without authoritative retention evidence", async () => {
    const f = await fixture();
    await expect(f.prepare()).rejects.toMatchObject({ code: "retention_unknown" });
    expect((await f.store.get(f.scope))?.revision).toBe(1);
});

test("a selected or transitioning exact release cannot be dropped from a manifest", async () => {
    let pins: { contractId: string; version: string; digest: string; location: string }[] = [];
    const f = await fixture({
        snapshot: async () => ({ complete: true, revision: "usage:1", releases: pins }),
        isCurrent: async () => true,
    });
    const old = f.admission.manifest.implementations[0]!;
    for (const location of ["site:one/selection", "transition:pending/source", "profile:official@1.0.0"]) {
        pins = [{ contractId: old.contractId, version: old.version, digest: old.digest, location }];
        await expect(f.prepare()).rejects.toMatchObject({ code: "release_in_use" });
    }
    expect((await f.store.get(f.scope))?.revision).toBe(1);
});

test("manifest reapproval rechecks retention revisions before changing the installation", async () => {
    let current = true;
    const f = await fixture({
        snapshot: async () => ({ complete: true, revision: "usage:1", releases: [] }),
        isCurrent: async () => current,
    });
    const plan = await f.prepare();
    current = false;
    await expect(f.lifecycle.modify(plan, "admin:owner")).rejects.toMatchObject({ code: "retention_unknown" });
    expect((await f.store.get(f.scope))?.revision).toBe(1);
});

test("unreferenced releases can be removed with explicit current evidence", async () => {
    const f = await fixture({
        snapshot: async () => ({ complete: true, revision: "usage:1", releases: [] }),
        isCurrent: async () => true,
    });
    const changed = await f.lifecycle.modify(await f.prepare(), "admin:owner");
    expect(changed.installation.approval.manifestVersion).toBe("2.0.0");
});
