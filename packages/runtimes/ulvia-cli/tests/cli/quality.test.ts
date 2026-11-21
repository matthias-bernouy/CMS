import { resourceName } from "@bernouy/ulvia-contracts/protocol";
import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { buildOfficialBootstrapArtifacts, writeOfficialBootstrapArtifacts } from "../../src/bootstrap/generate";
import {
    FilesystemCollectionRepository,
    FilesystemProviderRepository,
} from "@bernouy/repository/repository/filesystem";

let compiled: ReturnType<typeof buildOfficialBootstrapArtifacts> | undefined;
function officialArtifacts() {
    compiled ??= buildOfficialBootstrapArtifacts();
    return compiled;
}

test("regenerating bootstrap preserves declarations at the configured TypeScript output location", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-bootstrap-declarations-"));
    const configuration = await Bun.file(new URL("../../tsconfig.json", import.meta.url)).json();
    const declaration = join(root, configuration.compilerOptions.outDir, "bootstrap/generate.d.ts");
    const bytes = "export declare function generate(): Promise<void>;\n";
    try {
        await mkdir(dirname(declaration), { recursive: true });
        await writeFile(declaration, bytes);
        for (let attempt = 0; attempt < 2; attempt++) {
            await writeOfficialBootstrapArtifacts(join(root, "dist/bootstrap"), await officialArtifacts());
            expect(await readFile(declaration, "utf8")).toBe(bytes);
        }
    } finally {
        await rm(root, { recursive: true, force: true });
    }
}, 15_000);

test("SDK bootstrap retains the exact system APIs without a collection index", async () => {
    const artifacts = await buildOfficialBootstrapArtifacts();
    expect(Object.keys(artifacts.contracts)).toHaveLength(16);
    const root = await mkdtemp(join(tmpdir(), "ulvia-bootstrap-core-"));
    try {
        await writeOfficialBootstrapArtifacts(root, artifacts);
        expect((await Bun.file(join(root, "index.json")).json()).collections).toBeUndefined();
        const repository = join(root, "repository");
        expect(await new FilesystemCollectionRepository("core", repository).list()).toEqual([]);
        const providers = new FilesystemProviderRepository("core", repository);
        expect(await providers.list("contract")).toHaveLength(16);
        expect(await providers.list("provider-manifest")).toHaveLength(1);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("the compiled official snapshot retains exact release and asset bytes through filesystem admission", async () => {
    const artifacts = await officialArtifacts();
    const root = await mkdtemp(join(tmpdir(), "ulvia-bootstrap-build-"));
    try {
        await writeOfficialBootstrapArtifacts(root, artifacts);
        for (const [id, bytes] of Object.entries(artifacts.contracts)) {
            const segments = id.startsWith("ulvia/cms.")
                ? ["contracts", "cms", resourceName(id)]
                : ["contracts", resourceName(id)];
            expect((await readFile(join(root, ...segments, "definition.json"), "utf8")).trim()).toBe(bytes);
        }
        for (const asset of artifacts.contractAssets) {
            const segments = asset.contractId.startsWith("ulvia/cms.")
                ? ["contracts", "cms", resourceName(asset.contractId)]
                : ["contracts", resourceName(asset.contractId)];
            expect((await readFile(join(root, ...segments, asset.id))).equals(Buffer.from(asset.bytes))).toBe(true);
        }
        expect((await readFile(join(root, "providers", "primary-provider", "definition.json"), "utf8")).trim()).toBe(
            artifacts.provider,
        );
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
