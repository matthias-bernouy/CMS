import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { admitContractReleaseJson } from "@bernouy/cms-repository/contracts";
import { InMemoryReleaseCatalogue } from "@bernouy/cms-repository/contracts/catalogue";
import { admitProviderManifestJson } from "@bernouy/cms-repository/providers";
import { prepareCollectionRelease } from "../release/source";

export type OfficialBootstrapArtifacts = Readonly<{
    contracts: Readonly<Record<string, string>>;
    provider: string;
    collection: string;
}>;

export async function buildOfficialBootstrapArtifacts(): Promise<OfficialBootstrapArtifacts> {
    const root = resolve(import.meta.dir, "../../../../official-repository");
    const catalogue = new InMemoryReleaseCatalogue();
    const contracts: Record<string, string> = {};
    for (const id of await directories(join(root, "contracts"))) {
        const admission = await admitContractReleaseJson(
            await readFile(join(root, "contracts", id, "definition.json"), "utf8"),
        );
        await catalogue.publish(admission);
        contracts[id] = admission.canonicalJson;
    }
    const provider = await admitProviderManifestJson(
        await readFile(join(root, "providers", "ulvia.official", "definition.json"), "utf8"),
        catalogue,
    );
    const collection = await prepareCollectionRelease(join(root, "collections", "ulvia-official"), catalogue);
    return { contracts, provider: provider.canonicalJson, collection: collection.canonicalJson };
}

async function writeBootstrapArtifacts(): Promise<void> {
    const artifacts = await buildOfficialBootstrapArtifacts();
    const root = resolve(import.meta.dir, "resources");
    const contractPaths: string[] = [];
    for (const [id, bytes] of Object.entries(artifacts.contracts).sort(([left], [right]) =>
        left.localeCompare(right),
    )) {
        const path = id.startsWith("ulvia.cms.")
            ? `contracts/cms/${id}/definition.json`
            : `contracts/${id}/definition.json`;
        contractPaths.push(path);
        await writeArtifact(root, path, bytes);
    }
    const provider = "providers/ulvia.official/definition.json";
    const collection = "collections/ulvia-official/release.json";
    await writeArtifact(root, provider, artifacts.provider);
    await writeArtifact(root, collection, artifacts.collection);
    await writeFile(
        join(root, "index.json"),
        `${JSON.stringify({ contracts: contractPaths, provider, collection }, null, 4)}\n`,
    );
}

async function writeArtifact(root: string, path: string, bytes: string): Promise<void> {
    const target = join(root, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, `${bytes}\n`);
}

async function directories(root: string): Promise<string[]> {
    return (await readdir(root, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
}

if (import.meta.main) {
    await writeBootstrapArtifacts();
}
