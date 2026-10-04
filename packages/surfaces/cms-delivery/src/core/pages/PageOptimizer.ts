import { CMS_CACHE_KEYS } from "@bernouy/cms-content/rendering";
import type { BlobReader } from "@bernouy/blob-store";
import {
    type VariantStore,
    type PublicFileMetadataLookup,
    OptimizeQueue,
    optimizePageImages,
} from "@bernouy/cms-content/files/serving";
import type { Cache } from "@bernouy/http-runner";

type PageOptimizerConfig = {
    cache: Cache;
    metadata: PublicFileMetadataLookup;
    sourceBlob: BlobReader;
    variantStore: VariantStore;
};

export class PageOptimizer {
    private readonly queue = new OptimizeQueue();

    constructor(private readonly config: PageOptimizerConfig) {}

    optimize(path: string, imageIds: string[]): void {
        if (imageIds.length === 0) {
            return;
        }

        this.queue.enqueue(path, async () => {
            await optimizePageImages(this.config, imageIds);
            this.config.cache.delete(CMS_CACHE_KEYS.page(path));
        });
    }
}
