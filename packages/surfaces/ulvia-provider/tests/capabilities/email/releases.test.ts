import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { compileOfficialFeatures, compileOfficialManifest } from "@bernouy/ulvia-provider/build";
import { prepareContractSource } from "@bernouy/cms-repository/repository/authoring/build";
import { InMemoryReleaseCatalogue, publishContractSet } from "@bernouy/cms-repository/contracts/catalogue";
import { admitProviderManifestJson } from "@bernouy/ulvia-providers";

test("SDK email releases preserve every schema, mock, binding, document byte and parent digest", async () => {
    const compiled = await compileOfficialFeatures();
    for (const admission of compiled.contracts) {
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

test("generated manifest preserves its release identity and exact dependency claims", async () => {
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
    const next = await compileOfficialManifest(catalogue, await compileOfficialFeatures());
    expect(next.canonicalJson).toBe(old.canonicalJson);
    expect(next.digest).toBe(old.digest);
});
