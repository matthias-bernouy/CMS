import { collectionBrowserRisk, collectionBrowserRiskDigest } from "@bernouy/repository/collections";
import type { CollectionReadResource } from "./collection";

export function collectionPin(resource: CollectionReadResource, repositoryId: string) {
    return {
        repositoryId,
        publisherId: resource.namespace,
        collectionId: resource.id,
        version: resource.version,
        digest: resource.digest,
    };
}

export function collectionMetadata(resource: CollectionReadResource, repositoryId: string) {
    const risk = collectionBrowserRisk(resource.release);
    return {
        ...collectionPin(resource, repositoryId),
        name: resource.name,
        description: resource.description,
        blocCount: resource.release.blocs.length,
        hasTheme: false,
        browserRisk: risk.level,
        browserRiskDigest: collectionBrowserRiskDigest(risk),
        javaScriptBlocCount: 0,
        javaScriptBlocs: [],
        frameBlocCount: 0,
        frameBlocs: [],
        externalFrameOrigins: [],
        scriptsWithSameOrigin: false,
        channel: "stable",
    };
}

export function installedCollectionRow(resource: CollectionReadResource, repositoryId: string) {
    return {
        ...collectionPin(resource, repositoryId),
        blocCount: resource.release.blocs.length,
        exampleCount: resource.release.examples?.length ?? 0,
        assetCount: resource.assets.length,
        textCount: 0,
        themeTokenCount: 0,
        configurable: true,
    };
}

export function installedCollectionDetail(
    resource: CollectionReadResource,
    repositoryId: string,
    revision: number,
    title: string,
) {
    return {
        ...installedCollectionRow(resource, repositoryId),
        name: resource.name,
        description: resource.description,
        revision,
        configurationJson: JSON.stringify({ title }),
        overriddenLocaleCount: 0,
        blocs: resource.release.blocs.map((bloc) => ({
            id: bloc.id,
            label: "Panel",
            description: "Panel",
            catalogue: "listed",
        })),
    };
}
