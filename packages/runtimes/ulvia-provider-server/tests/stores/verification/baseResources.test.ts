import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { InMemoryContentRepository } from "@bernouy/content";
import { bundledBootstrapSources } from "../../../src/runtime/instances/profiles/bootstrap";
import { loadOfficialArtifacts } from "../../../src/runtime/instances/profiles/artifacts";
import { HostPreparationPool } from "../../../src/runtime/instances/verification/HostPreparationPool";

test("every shipped base ZIP previews ordinary Page writes against its exact selected profile without collection installations", async () => {
    const sources = bundledBootstrapSources();
    const loaded = await loadOfficialArtifacts(sources.providers, sources.collections);
    const pool = new HostPreparationPool();
    try {
        for (const profile of loaded.profiles) {
            const selected = loaded.contracts.filter((contract) =>
                profile.contracts.some(
                    (pin) =>
                        pin.contractId === contract.release.contractId &&
                        pin.version === contract.release.version &&
                        pin.digest === contract.digest,
                ),
            );
            for (const locale of ["en", "fr"]) {
                const path = resolve(import.meta.dir, "../../../dist/bootstrap/resources", profile.id, locale + ".zip");
                const digest = (await Bun.file(path + ".sha256").text()).trim();
                const signal = new AbortController().signal;
                const archive = await pool.resources.verify(Bun.file(path), digest, signal);
                const preview = await pool.resources.preview(
                    archive,
                    { selected, denied: [], fingerprint: profile.manifest.digest },
                    await new InMemoryContentRepository().getSystem(),
                    signal,
                );
                expect(preview.pages).toHaveLength(profile.id === "ulvia" ? 17 : 25);
                expect(preview.pages.every(({ visible }) => visible)).toBe(true);
                expect(
                    [...preview.requirements, ...archive.document.pages.flatMap((page) => page.requires ?? [])].some(
                        ({ contractId }) => contractId === "ulvia/repository",
                    ),
                ).toBe(profile.id === "repository");
            }
        }
    } finally {
        await pool.close();
    }
}, 30000);
