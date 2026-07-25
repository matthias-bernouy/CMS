import { join } from "node:path";
import {
    createDisabledSourceImageInterceptor,
    createSourceImageInterceptor,
    SourceImageSemaphore,
} from "@bernouy/cms-source-images";
import { LocalSourceImageCache } from "@bernouy/cms-source-images/local-fs";
import type { SourceEndpointInterceptor } from "@bernouy/cms-sources";

const LOCAL_VARIANT_DIRECTORY = ".cms-variants";
const LOCAL_SOURCE_IMAGE_CACHE_DIRECTORY = "source-images";

export type LocalSourceImageComposition = Readonly<{
    sourceImageInterceptor: SourceEndpointInterceptor;
    responsivePublicSourceImagesEnabled: boolean;
    responsivePrivateSourceImagesEnabled: boolean;
    dispose: () => Promise<void>;
}>;

export async function createLocalSourceImageComposition(options: {
    siteDir: string;
    scope: string;
    enabled: boolean;
}): Promise<LocalSourceImageComposition> {
    if (!options.enabled) {
        return {
            sourceImageInterceptor: createDisabledSourceImageInterceptor(),
            responsivePublicSourceImagesEnabled: false,
            responsivePrivateSourceImagesEnabled: false,
            dispose: async () => undefined,
        };
    }

    const cache = new LocalSourceImageCache({
        directory: localSourceImageCachePath(options.siteDir),
    });
    await cache.initialize();
    const { SharpSourceImageTransformer } = await import("@bernouy/cms-source-images/sharp");
    return {
        sourceImageInterceptor: createSourceImageInterceptor({
            cache,
            transformer: new SharpSourceImageTransformer(),
            semaphore: new SourceImageSemaphore(1),
            semaphoreWaitTimeoutMs: 5_000,
            scope: options.scope,
        }),
        responsivePublicSourceImagesEnabled: true,
        responsivePrivateSourceImagesEnabled: true,
        dispose: () => cache.dispose(),
    };
}

export function localSourceImageCachePath(siteDir: string): string {
    return join(siteDir, LOCAL_VARIANT_DIRECTORY, LOCAL_SOURCE_IMAGE_CACHE_DIRECTORY);
}
