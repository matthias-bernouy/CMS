import { InMemoryReleaseCatalogue, publishContractSet } from "@bernouy/repository/contracts/catalogue";
import { compileOfficialFeatures } from "@bernouy/ulvia-provider/build";

export async function officialContractCatalogue(): Promise<InMemoryReleaseCatalogue> {
    const catalogue = new InMemoryReleaseCatalogue();
    await publishContractSet(catalogue, (await compileOfficialFeatures()).contracts);
    return catalogue;
}
