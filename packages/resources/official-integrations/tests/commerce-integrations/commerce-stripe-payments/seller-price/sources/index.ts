import { InMemorySourceRepository, makeSourceUrn, type Source, type SourceEndpoint } from "@bernouy/cms-sources";
import { commerceEndpoints } from "./commerce";
import { stripeEndpoints } from "./stripe";

export async function sellerPriceSources(): Promise<InMemorySourceRepository> {
    const repository = new InMemorySourceRepository();
    await repository.createSource(source("commerce", commerceEndpoints()));
    await repository.createSource(source("stripe-connect", stripeEndpoints()));
    return repository;
}

function source(id: string, endpoints: SourceEndpoint[]): Source {
    return {
        urn: makeSourceUrn(id),
        meta: { name: id },
        endpoints,
    };
}
