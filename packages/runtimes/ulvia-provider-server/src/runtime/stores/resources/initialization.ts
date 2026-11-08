import type { ResourceInitializationOptions } from "@bernouy/resources/initialization";
import { ResourceInitializationService } from "@bernouy/resources/initialization";
import type { ContentRepository } from "@bernouy/content";
import { PrivateResourceArchives } from "./archives";

type Preparation = Pick<ResourceInitializationOptions, "verify" | "preview">;
type ResourceStores = Pick<ResourceInitializationOptions, "metadata" | "assets" | "texts" | "state">;
export function resourceInitializationFactory(
    instanceId: string,
    siteId: string,
    directory: string,
    stores: ResourceStores,
    content: ContentRepository,
    raw: Pick<ContentRepository, "createBloc">,
    intents: ResourceInitializationOptions["intents"],
    execution: ResourceInitializationOptions["execution"],
) {
    const retained = new PrivateResourceArchives(directory);
    return (host: Preparation & Pick<ResourceInitializationOptions, "authorize" | "source">) =>
        new ResourceInitializationService({
            ...host,
            instanceId,
            siteId,
            metadata: stores.metadata,
            assets: stores.assets,
            texts: stores.texts,
            state: stores.state,
            content,
            createBloc: (bloc) => raw.createBloc(bloc),
            intents,
            retained,
            execution,
            now: () => new Date(),
        });
}
