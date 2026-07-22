import { InMemorySourceRepository } from "@bernouy/cms-sources";
import { accountEndpoints } from "./accounts";
import { makeSource } from "./builders";
import { commerceEndpoints } from "./commerce";
import { deliveryEndpoints } from "./delivery";

export async function sourcesForFulfillment(): Promise<InMemorySourceRepository> {
    const repository = new InMemorySourceRepository();
    await repository.createSource(makeSource("commerce", commerceEndpoints));
    await repository.createSource(makeSource("delivery", deliveryEndpoints));
    await repository.createSource(makeSource("accounts", accountEndpoints));
    return repository;
}
