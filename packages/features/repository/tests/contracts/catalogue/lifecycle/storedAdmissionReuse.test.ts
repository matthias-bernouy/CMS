import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { admitContractRelease, verifyStoredContractReleaseJson } from "@bernouy/ulvia-contracts";
import { InMemoryReleaseCatalogue } from "repository/contracts/default-implementation/memory/InMemoryReleaseCatalogue";
import { LocalArtifactFiles } from "repository/repository/filesystem/artifacts/files";
import { LocalContractReleases } from "repository/repository/filesystem/contracts";
import { LocalRepositoryYanks } from "repository/repository/filesystem/yanks";
import { contractDocument } from "../../../../../../platform/contracts/tests/support/fixtures";

test("reused stored admissions do not share mutable catalogue metadata", async () => {
    const release = await admitContractRelease(contractDocument());
    const first = new InMemoryReleaseCatalogue();
    const second = new InMemoryReleaseCatalogue();
    const a = await first.restore(release.canonicalJson, release.digest, "2026-01-01T00:00:00Z");
    const b = await second.restore(release.canonicalJson, release.digest, "2026-02-01T00:00:00Z");
    expect(a.admission).toBe(b.admission);
    expect(a.publishedAt).not.toBe(b.publishedAt);
    await first.setYank(release.release.contractId, release.release.version, { reason: "Withdrawn" });
    await first.setDeprecation(release.release.contractId, release.release.version, { reason: "Deprecated" });
    expect((await first.findByDigest(release.digest))?.yank).toEqual({ reason: "Withdrawn" });
    expect((await second.findByDigest(release.digest))?.yank).toBeUndefined();
    expect((await second.findByDigest(release.digest))?.deprecation).toBeUndefined();
    await first.setYank(release.release.contractId, release.release.version, null);
    expect((await first.findByDigest(release.digest))?.yank).toBeUndefined();
});

test("new publication still revalidates complete artifacts after stored structure is warm", async () => {
    const release = await admitContractRelease(contractDocument());
    await verifyStoredContractReleaseJson(release.canonicalJson, release.digest);
    const catalogue = new InMemoryReleaseCatalogue();
    const forged = { ...release, release: { ...release.release, name: "Altered" } };
    await expect(catalogue.publish(forged)).rejects.toThrow("integrity verification");
    expect(await catalogue.list()).toEqual([]);
    await expect(
        catalogue.publish({ ...release, fixtureAssets: [{ id: "unexpected", bytes: new Blob(["bad"]) }] }),
    ).rejects.toThrow("unexpected fixture");
    expect(await catalogue.list()).toEqual([]);
});

test("filesystem readers keep current yanks, owner coordinates and corrupt bytes checks", async () => {
    const root = await mkdtemp(join(tmpdir(), "stored-admission-isolation-"));
    try {
        const release = await admitContractRelease(contractDocument());
        const { publisherId, contractId, version } = release.release;
        const roots = [join(root, "one"), join(root, "two")];
        for (const directory of roots) {
            await new LocalArtifactFiles(directory).store(
                "contracts",
                publisherId,
                contractId,
                version,
                release.canonicalJson,
            );
        }
        const yanks = new LocalRepositoryYanks(roots[0]!);
        const reader = () => new LocalContractReleases(new LocalArtifactFiles(roots[0]!), yanks);
        const other = new LocalContractReleases(new LocalArtifactFiles(roots[1]!));
        const first = await reader().getMetadata(publisherId, contractId, version);
        expect(await other.getMetadata(publisherId, contractId, version)).toBe(first);
        await reader().catalogue();
        await yanks.set("contract", publisherId, contractId, version, "Withdrawn");
        expect((await (await reader().catalogue()).get(contractId, version))?.yank).toEqual({ reason: "Withdrawn" });
        expect((await (await other.catalogue()).get(contractId, version))?.yank).toBeUndefined();
        await yanks.set("contract", publisherId, contractId, version, null);
        expect((await (await reader().catalogue()).get(contractId, version))?.yank).toBeUndefined();
        await new LocalArtifactFiles(roots[1]!).store(
            "contracts",
            publisherId,
            "ulvia/other",
            version,
            release.canonicalJson,
        );
        await expect(other.getMetadata(publisherId, "ulvia/other", version)).rejects.toThrow("Corrupt local contract");
        await expect(other.catalogue()).rejects.toThrow("Corrupt local contract");
        await writeFile(join(roots[0]!, "contracts", publisherId, "communication.email", `${version}.json`), "{");
        await expect(reader().getMetadata(publisherId, contractId, version)).rejects.toThrow("malformed JSON");
        await expect(reader().catalogue()).rejects.toThrow("malformed JSON");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
