import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readResourceArchive } from "@bernouy/resources";
import { buildOfficialBootstrapArtifacts, writeOfficialBootstrapArtifacts } from "../../../src/bootstrap/generate";

test("core-only bootstrap ships verified localized base ZIPs outside the release catalogue", async () => {
    const artifacts = await buildOfficialBootstrapArtifacts({ includeCollections: false });
    expect(artifacts.collections).toEqual([]);
    expect(artifacts.baseResources.map(({ profileId, locale }) => `${profileId}/${locale}`)).toEqual([
        "ulvia/en",
        "ulvia/fr",
        "repository/en",
        "repository/fr",
    ]);
    const root = await mkdtemp(join(tmpdir(), "ulvia-base-bootstrap-"));
    try {
        await writeOfficialBootstrapArtifacts(root, artifacts);
        expect(Object.keys(await Bun.file(join(root, "index.json")).json()).sort()).toEqual([
            "collections",
            "contracts",
            "provider",
        ]);
        for (const resource of artifacts.baseResources) {
            const path = join(root, "resources", resource.profileId, resource.locale + ".zip");
            expect((await Bun.file(path + ".sha256").text()).trim()).toBe(resource.digest);
            const archive = await readResourceArchive(Bun.file(path), { expectedDigest: resource.digest });
            expect(archive.document.blocs).toHaveLength(resource.profileId === "ulvia" ? 99 : 100);
            expect(archive.document.pages).toHaveLength(resource.profileId === "ulvia" ? 17 : 25);
            expect(archive.document.pages.some(({ path }) => path.startsWith("/admin/collections"))).toBe(false);
            expect(archive.document.blocs.some(({ id }) => id.startsWith("ulvia--mossa--collection-"))).toBe(false);
            expect(archive.document.pages.filter(({ systemRole }) => systemRole === "login")).toHaveLength(1);
            expect(archive.document.blocs.find(({ id }) => id === "ulvia--repository--shell") !== undefined).toBe(
                resource.profileId === "repository",
            );
            expect(archive.document.pages.find(({ path }) => path === "/admin/access")!.title).toBe(
                resource.locale === "fr" ? "Utilisateurs" : "Users",
            );
        }
    } finally {
        await rm(root, { recursive: true, force: true });
    }
}, 30000);

test("official base output is a bounded immutable build snapshot and a completed build does not read sources again", async () => {
    const first = await buildOfficialBootstrapArtifacts({ includeCollections: false });
    const second = await buildOfficialBootstrapArtifacts({ includeCollections: false });
    expect(first.baseResources).toBe(second.baseResources);
    expect(Object.isFrozen(first.baseResources)).toBe(true);
    expect(first.baseResources.reduce((bytes, resource) => bytes + resource.bytes.size, 0)).toBeLessThan(
        32 * 1024 * 1024,
    );
});
