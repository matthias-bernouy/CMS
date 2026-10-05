import { resolve } from "node:path";
import { admitContractReleaseJson } from "@bernouy/cms-repository/contracts";
import { InMemoryReleaseCatalogue } from "@bernouy/cms-repository/contracts/catalogue";

export async function officialContractCatalogue(): Promise<InMemoryReleaseCatalogue> {
    const catalogue = new InMemoryReleaseCatalogue();
    for (const contractId of ["catalog.items", "ulvia.cms.pages"]) {
        const path = resolve(import.meta.dir, `../../../official-repository/contracts/${contractId}/definition.json`);
        await catalogue.publish(await admitContractReleaseJson(await Bun.file(path).text()));
    }
    return catalogue;
}
