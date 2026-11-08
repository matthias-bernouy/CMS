import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { compileOfficialFeatures, compileOfficialManifest } from "@bernouy/ulvia-provider/build";
import { prepareContractSource } from "@bernouy/repository/repository/authoring/build";
import { InMemoryReleaseCatalogue, publishContractSet } from "@bernouy/repository/contracts/catalogue";
import type { ProviderManifest } from "@bernouy/ulvia-providers";
import { admitProviderManifestJson } from "@bernouy/ulvia-providers";

test("SDK feature releases preserve every schema, mock, binding, document byte and parent digest", async () => {
    const compiled = await compileOfficialFeatures();
    for (const admission of compiled.contracts.filter(({ release }) => release.contractId !== "ulvia/cms.resources")) {
        const name = admission.release.contractId.slice("ulvia/".length);
        const old = (
            await prepareContractSource(
                resolve(import.meta.dir, `../../../../../official-repository/contracts/${name}`),
            )
        ).admission;
        expect(admission.canonicalJson).toBe(old.canonicalJson);
        expect(admission.digest).toBe(old.digest);
        for (const asset of admission.documentationAssets ?? []) {
            const expected = old.documentationAssets!.find(({ id }) => id === asset.id)!;
            expect(new Uint8Array(await asset.bytes.arrayBuffer())).toEqual(
                new Uint8Array(await expected.bytes.arrayBuffer()),
            );
        }
    }
});

test("the new manifest adds Resources while preserving every previous exact claim and dependency", async () => {
    const root = resolve(import.meta.dir, "../../../../../official-repository");
    const catalogue = new InMemoryReleaseCatalogue();
    const { readdir } = await import("node:fs/promises");
    const admissions = await Promise.all(
        (await readdir(resolve(root, "contracts"))).map(
            async (name) => (await prepareContractSource(resolve(root, "contracts", name))).admission,
        ),
    );
    await publishContractSet(catalogue, admissions);
    const old = await admitProviderManifestJson(
        await readFile(resolve(root, "providers/primary-provider/definition.json"), "utf8"),
        catalogue,
    );
    const compiled = await compileOfficialFeatures();
    await publishContractSet(catalogue, compiled.contracts);
    const next = await compileOfficialManifest(catalogue, compiled);
    expect(next.manifest.version).toBe("1.3.0");
    expect(next.digest).not.toBe(old.digest);
    expect(next.manifest.implementations.filter(({ contractId }) => contractId === "ulvia/cms.resources")).toHaveLength(
        1,
    );
    const projected: ProviderManifest = {
        ...next.manifest,
        version: old.manifest.version,
        implementations: next.manifest.implementations.filter(({ contractId }) => contractId !== "ulvia/cms.resources"),
    };
    expect(projected).toEqual(old.manifest);
});
