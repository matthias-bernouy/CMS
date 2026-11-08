import type { ContentReader, RenderableBloc, RenderingSettings } from "@bernouy/content/rendering";
import type { AssetsManifest } from "@bernouy/content/rendering";
import type { BlocViewCache } from "@bernouy/content/rendering";

/** Inputs and injected resource ports needed to render one Content document. */
export type RenderContext = {
    content: ContentReader;
    renderingSettings?: RenderingSettings;
    contentRevision?: number | string;
    resolveContributedAssets?: (input: string) => Promise<string>;
    resolveSvgSources?: (sources: readonly string[]) => Promise<ReadonlyMap<string, string | Uint8Array>>;
    prepareBody?: (body: Element) => void | Promise<void>;
    resolveAssets: (
        usedTags: string[],
        renderableBlocs: readonly RenderableBloc[],
        blocViews: BlocViewCache,
    ) => Promise<AssetsManifest>;
    /** Public stable URL emitted as `<link rel="icon">`. */
    faviconUrl: string;
};
