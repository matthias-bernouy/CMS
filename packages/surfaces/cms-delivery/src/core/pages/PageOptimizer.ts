import { P9R_CACHE } from "@bernouy/cms-content";
import {
    type CmsFilesBlobStore,
    type CmsFilesMetadataRepository,
    OptimizeQueue,
    optimizePageImages,
} from "@bernouy/cms-files";
import type { Cache } from "@bernouy/http-runner";

type PageOptimizerConfig = {
    cache: Cache;
    metadata: CmsFilesMetadataRepository;
    sourceBlob: CmsFilesBlobStore;
    variantStore: CmsFilesBlobStore;
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
            this.config.cache.delete(P9R_CACHE.page(path));
        });
    }
}
