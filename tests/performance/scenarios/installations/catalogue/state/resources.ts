import { InMemoryReleaseCatalogue } from "@bernouy/repository/contracts/catalogue";
import { catalogueContract } from "../resources/contract";
import { catalogueProvider } from "../resources/provider";
import { publishCatalogueResource } from "../resources/publication";
import { assertCondition } from "../../../queries/types";
import type { CatalogueContract } from "../resources/contract";
import type { CatalogueProvider } from "../resources/provider";
import type { registryCalls } from "../../../repository/client";

export function metadataResources(calls: ReturnType<typeof registryCalls>, namespace: string, revision: number) {
    const catalogue = new InMemoryReleaseCatalogue();
    const contracts: CatalogueContract[] = [];
    const providers: CatalogueProvider[] = [];
    let failed = false;
    const write = async <T>(action: () => Promise<T>) => {
        assertCondition(
            !failed && contracts.length + providers.length < 256,
            "metadata-resources-write-or-count-bound",
        );
        try {
            return await action();
        } catch (error) {
            failed = true;
            throw error;
        }
    };
    return {
        contracts,
        providers,
        namespace,
        contract: (patch: number, large = false) =>
            write(async () => {
                assertCondition(
                    contracts.length < 64 && !contracts.some((row) => row.version === `1.0.${patch}`),
                    "metadata-resources-contract-coordinate",
                );
                const resource = await catalogueContract(namespace, patch, large);
                await publishCatalogueResource(calls, revision, resource);
                await catalogue.publish(resource.admission);
                contracts.push(resource);
                return resource;
            }),
        provider: (index: number, patch: number) =>
            write(async () => {
                assertCondition(
                    providers.length < 128 && !providers.some((row) => row.index === index && row.patch === patch),
                    "metadata-resources-provider-coordinate",
                );
                const resource = await catalogueProvider(namespace, index, patch, contracts, catalogue);
                await publishCatalogueResource(calls, revision, resource);
                providers.push(resource);
                return resource;
            }),
        latestContract: () => {
            assertCondition(contracts.length, "metadata-contract-required");
            return contracts.at(-1)!;
        },
        latestProvider: (index = 0) => {
            const resource = providers.filter((row) => row.index === index).at(-1);
            assertCondition(resource, "metadata-provider-required");
            return resource;
        },
        nextProviderPatch: () => Math.max(...providers.filter((row) => row.index === 0).map((row) => row.patch)) + 1,
    };
}

export type MetadataResources = ReturnType<typeof metadataResources>;
