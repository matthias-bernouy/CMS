import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { AdmittedContractRelease } from "@bernouy/cms-repository/contracts";
import { InMemoryReleaseCatalogue } from "@bernouy/cms-repository/contracts/catalogue";
import { admitProviderManifestJson } from "@bernouy/cms-repository/providers";
import { compileConformanceSource, prepareConformanceSource } from "../release/authored/conformance";
import { resolveConformanceDependencies } from "../release/authored/conformanceDependencies";
import { prepareContractSource } from "../release/authored/contract";
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
    const admissions = new Map<string, AdmittedContractRelease>();
    const contractIds = await directories(join(root, "contracts"));
    for (const id of contractIds) {
        const directory = join(root, "contracts", id);
        const { admission } = await prepareContractSource(directory);
        await catalogue.publish(admission);
        contracts[id] = admission.canonicalJson;
        admissions.set(`${admission.release.contractId}@${admission.release.version}`, admission);
    }
    for (const id of contractIds) {
        const directory = join(root, "contracts", id);
        const conformance = await compileConformanceSource(directory);
        if (conformance) {
            const definition = JSON.parse(conformance) as { contractId?: unknown; contractVersion?: unknown };
            const release = admissions.get(`${definition.contractId}@${definition.contractVersion}`);
            if (!release) {
                throw new Error(`Conformance source ${id} does not identify an official contract release`);
            }
            const dependencies = await resolveConformanceDependencies(conformance, async (contractId, version) => {
                return admissions.get(`${contractId}@${version}`) ?? null;
            });
            await prepareConformanceSource(directory, release, dependencies, conformance);
        }
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
