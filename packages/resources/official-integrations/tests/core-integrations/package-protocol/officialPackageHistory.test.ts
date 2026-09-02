import { afterEach, describe, expect, test } from "bun:test";
import { appendFile, cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { buildOfficialIntegrationPackages } from "@bernouy/cms-official-integrations/publication";

const PHOTO_ALBUMS_1_0_0_DIGEST = "61dd7b41ee3594a8bf8ed60d1adbdee993705787207d8cbef03383e6797b275f";
const roots: string[] = [];

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("official package history", () => {
    test("loads immutable releases independently from current authoring indexes", async () => {
        const root = await temporaryOfficialRoot();
        const packages = await buildOfficialIntegrationPackages(root);

        expect(packages.map(({ kind, version }) => `${kind}@${version}`)).toEqual([
            "basic-blocs@1.0.0",
            "photo-albums@1.0.0",
            "photo-albums@1.1.0",
            "photo-albums@1.2.0",
        ]);
        expect(packages.find(({ kind, version }) => kind === "photo-albums" && version === "1.0.0")?.digest).toBe(
            PHOTO_ALBUMS_1_0_0_DIGEST,
        );
    });

    test("rejects a non-canonical historical package object", async () => {
        const root = await temporaryOfficialRoot();
        await appendFile(
            join(root, `.registry/packages/objects/sha256/${PHOTO_ALBUMS_1_0_0_DIGEST}/package.json`),
            "\n",
        );

        await expect(buildOfficialIntegrationPackages(root)).rejects.toThrow("canonical JSON");
    });
});

async function temporaryOfficialRoot(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "cms-official-package-history-"));
    roots.push(root);
    await cp(join(OFFICIAL_INTEGRATIONS_ROOT, "foundation", "basic-blocs"), join(root, "foundation", "basic-blocs"), {
        recursive: true,
    });
    await cp(join(OFFICIAL_INTEGRATIONS_ROOT, ".registry", "packages"), join(root, ".registry", "packages"), {
        recursive: true,
    });
    return root;
}
