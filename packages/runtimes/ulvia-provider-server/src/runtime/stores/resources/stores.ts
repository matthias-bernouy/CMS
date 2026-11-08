import type { Db } from "mongodb";
import { join } from "node:path";
import { LocalFsBlobStore } from "@bernouy/blob-store/local-fs";
import { MongoResourceMetadataStore, MongoResourceInitializationStateStore } from "@bernouy/resources/mongo";
import { ResourceAssets, ResourceTexts, withResourceTexts } from "@bernouy/resources/storage";
import type { ContentRepository } from "@bernouy/content";

export async function createResourceStores(
    db: Db,
    directory: string,
    instanceId: string,
    siteId: string,
    content: ContentRepository,
) {
    const metadata = new MongoResourceMetadataStore(db, siteId);
    await metadata.init();
    const assets = new ResourceAssets(metadata, new LocalFsBlobStore(join(directory, "resource-assets")));
    const texts = new ResourceTexts(metadata);
    const state = new MongoResourceInitializationStateStore(db, instanceId, siteId);
    return { metadata, assets, texts, state, content: withResourceTexts(content, texts) };
}
