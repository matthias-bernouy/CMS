import { resolve } from "node:path";
import { InMemoryReleaseCatalogue } from "@bernouy/cms-repository/contracts/catalogue";
import { prepareContractSource } from "../src/release/authored/contract";

export async function officialContractCatalogue(): Promise<InMemoryReleaseCatalogue> {
    const catalogue = new InMemoryReleaseCatalogue();
    for (const contractId of [
        "ulvia.cms.secrets",
        "ulvia.cms.emailer",
        "ulvia.cms.emailer.smtp",
        "ulvia.cms.access",
        "ulvia.cms.installations",
        "ulvia.cms.content",
        "ulvia.cms.files",
        "ulvia.cms.observability",
        "ulvia.provider.connections",
    ]) {
        const directory = resolve(import.meta.dir, `../../../official-repository/contracts/${contractId}`);
        await catalogue.publish((await prepareContractSource(directory)).admission);
    }
    return catalogue;
}
