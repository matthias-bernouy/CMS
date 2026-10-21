import type { ContentReader, RenderableBloc } from "@bernouy/cms-content/rendering";
import type { AssetsManifest } from "@bernouy/cms-content/rendering";

/**
 * Everything `renderPage` needs that isn't the page itself. Decoupled from
 * `KernelCms` so the same renderer drives both the runtime serving path
 * (assets resolved via the local cache, URLs under `<basePath>/.cms/*`) and
 * the build pipeline (assets pre-uploaded to a CDN, URLs are CDN
 * `absoluteURL`s).
 *
 * `resolveAssets` is the strategy seam — it receives the bloc tags actually
 * used in the page and returns hashed URLs ready to inject into `<head>`.
 */
export type RenderContext = {
    content: ContentReader;
    resolveContributedAssets?: (input: string) => Promise<string>;
    resolveSvgSources?: (sources: readonly string[]) => Promise<ReadonlyMap<string, string | Uint8Array>>;
    prepareBody?: (body: Element) => void | Promise<void>;
    resolveAssets: (usedTags: string[], renderableBlocs: readonly RenderableBloc[]) => Promise<AssetsManifest>;
    /** Public stable URL emitted as `<link rel="icon">`. */
    faviconUrl: string;
    enforceCsp?: boolean;
};
