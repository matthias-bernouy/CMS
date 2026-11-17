import { expect, test } from "bun:test";
import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { verifyStoredCollectionArtifact } from "@bernouy/repository/collections";
import { administrationBundle, administrationDataset, MOSSA_DIGEST } from "./bundle";
import { administrationControls, canonicalDigest } from "./model";

test("the pinned production regression contains real administration bindings and intact asset evidence", async () => {
    const artifact = await administrationBundle();
    const release = artifact.release;
    expect(String(artifact.digest)).toBe(MOSSA_DIGEST);
    expect(release.blocs).toHaveLength(107);
    expect(release.examples).toHaveLength(117);
    expect(artifact.assets).toHaveLength(58);
    expect(artifact.assets.reduce((sum, asset) => sum + asset.bytes.size, 0)).toBe(1_116_374);
    const dataset = administrationDataset(release, artifact.digest);
    expect(dataset.paths).toHaveLength(21);
    expect(dataset.pages?.find(({ systemRole }) => systemRole === "login")?.path).toBe("/login");
    expect(release.examples?.some(({ document }) => document.html.includes("cms-queries="))).toBe(true);
    const controls = administrationControls(release);
    expect(release.bootstraps).toHaveLength(1);
    expect(controls.blocs).toEqual(release.blocs);
    expect(controls.assets).toEqual(release.assets);
    expect(controls.examples?.filter(({ id }) => id !== "performance-control")).toEqual([...release.examples!]);
    expect(controls.bootstraps?.map(({ pages }) => pages.length)).toEqual([21, 0, 1, 21]);
    const controlArtifact = await verifyStoredCollectionArtifact(
        controls,
        artifact.assets,
        canonicalDigest(canonicalizeIJson(controls)),
    );
    expect(controlArtifact.digest).not.toBe(artifact.digest);
    for (const count of [0, 1, 21]) {
        expect(administrationDataset(controls, controlArtifact.digest, `performance-${count}`).paths).toHaveLength(
            count,
        );
    }
    const tampered = [...artifact.assets];
    tampered[0] = { ...tampered[0]!, bytes: new Blob(["corrupt"]) };
    await expect(verifyStoredCollectionArtifact(release, tampered, MOSSA_DIGEST)).rejects.toThrow();
}, 120_000);
