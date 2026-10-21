import { resolve } from "node:path";
import { admitContractReleaseJson } from "@bernouy/cms-repository/contracts";
import { InMemoryReleaseCatalogue } from "@bernouy/cms-repository/contracts/catalogue";
import { compileContractSource } from "../src/release/authored/contract";

export async function officialContractCatalogue(): Promise<InMemoryReleaseCatalogue> {
    const catalogue = new InMemoryReleaseCatalogue();
    for (const contractId of ["ulvia.cms.access", "ulvia.cms.installations", "ulvia.cms.content", "ulvia.cms.files"]) {
        const directory = resolve(import.meta.dir, `../../../official-repository/contracts/${contractId}`);
        await catalogue.publish(await admitContractReleaseJson(await compileContractSource(directory)));
    }
    return catalogue;
}
