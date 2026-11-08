import { readdir } from "node:fs/promises";
import { join } from "node:path";
import {
    admitContractBundleJson,
    parseContractReleaseJson,
    type AdmittedContractRelease,
} from "@bernouy/ulvia-contracts";
import { InMemoryReleaseCatalogue } from "@bernouy/repository/contracts/catalogue";

const CONTRACT_ROOT = join(import.meta.dir, "../../packages/runtimes/ulvia-cli/dist/bootstrap/contracts/cms");

export async function officialContractDocuments(): Promise<Array<{ name: string; json: string }>> {
    const directories = (await readdir(CONTRACT_ROOT, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .toSorted();
    return Promise.all(
        directories.map(async (name) => ({
            name,
            json: await Bun.file(join(CONTRACT_ROOT, name, "definition.json")).text(),
        })),
    );
}

export async function officialContractAdmissions(): Promise<AdmittedContractRelease[]> {
    const documents = await officialContractDocuments();
    return Promise.all(
        documents.map(({ name, json }) =>
            admitContractBundleJson(
                json,
                (parseContractReleaseJson(json).documentation ?? []).map((document) => ({
                    id: `docs/${document.path}`,
                    bytes: Bun.file(join(CONTRACT_ROOT, name, "docs", document.path)),
                })),
            ),
        ),
    );
}

export async function officialContractCatalogue(): Promise<InMemoryReleaseCatalogue> {
    const catalogue = new InMemoryReleaseCatalogue();
    for (const admission of await officialContractAdmissions()) {
        await catalogue.publish(admission);
    }
    return catalogue;
}
