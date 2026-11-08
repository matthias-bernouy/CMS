import { expect, spyOn, test } from "bun:test";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { LocalArtifactFiles } from "@bernouy/repository/repository/filesystem";
import { bundledBootstrapSources } from "../../../src/runtime/instances/profiles/bootstrap";
import { loadOfficialArtifacts } from "../../../src/runtime/instances/profiles/artifacts";

const snapshot = resolve(import.meta.dir, "../../../dist/bootstrap");

test("loads the complete official profile and documentation from immutable files without network", async () => {
    const network = spyOn(globalThis, "fetch").mockImplementation(async () => {
        throw new Error("Bootstrap must not contact a Repository");
    });
    try {
        const sources = bundledBootstrapSources(snapshot);
        const loaded = await loadOfficialArtifacts(sources.providers, sources.collections);
        expect(loaded.defaultProfile.id).toBe("ulvia");
        expect(loaded.contracts.length).toBeGreaterThan(0);
        const documented = loaded.contracts.filter(({ release }) => release.documentation?.length);
        expect(documented.length).toBeGreaterThan(0);
        expect(
            documented.every(({ release }) =>
                loaded.profiles.some((profile) =>
                    profile.contracts.some((pin) => pin.contractId === release.contractId),
                ),
            ),
        ).toBe(true);
        const [collection] = await sources.collections.list();
        const bundle = await sources.collections.get(collection!);
        expect(bundle.assets.length).toBeGreaterThan(0);
        expect((await loadOfficialArtifacts(sources.providers, sources.collections)).defaultProfile).toEqual(
            loaded.defaultProfile,
        );
        await expect(
            sources.providers.get({
                ...(await sources.providers.list("contract"))[0]!,
                digest: `sha256:${"0".repeat(64)}`,
            }),
        ).rejects.toThrow("digest mismatch");
        expect(network).not.toHaveBeenCalled();
    } finally {
        network.mockRestore();
    }
}, 30_000);

test("missing snapshot and corrupt declared documentation fail without a remote fallback", async () => {
    const root = await mkdtemp(join(tmpdir(), "bundled-bootstrap-"));
    const network = spyOn(globalThis, "fetch").mockImplementation(async () => {
        throw new Error("No network fallback");
    });
    try {
        let sources = bundledBootstrapSources(root);
        await expect(loadOfficialArtifacts(sources.providers, sources.collections)).rejects.toThrow("unavailable");
        await cp(snapshot, root, { recursive: true });
        sources = bundledBootstrapSources(root);
        const entries = await sources.providers.list("contract");
        const entry = entries.find(({ id }) => id === "ulvia/cms.content")!;
        const bytes = await sources.providers.get(entry);
        const canonical = new TextDecoder().decode(bytes);
        const release = JSON.parse(canonical);
        const document = release.documentation[0];
        const file = new LocalArtifactFiles(root).fixtureBlob(canonical, `docs/${document.path}`);
        await Bun.write(file, "corrupt");
        await expect(loadOfficialArtifacts(sources.providers, sources.collections)).rejects.toThrow();
        expect(network).not.toHaveBeenCalled();
    } finally {
        network.mockRestore();
        await rm(root, { recursive: true, force: true });
    }
}, 30_000);
