import type { Runner, Middleware } from "@bernouy/http-runner";
import type { CmsFilesMetadataRepository } from "cms-files/interfaces/CmsFilesMetadataRepository";
import type { CmsFilesBlobStore } from "cms-files/interfaces/CmsFilesBlobStore";
import { serveFilesRequest } from "cms-files/http/serveFilesRequest";

/**
 * Mount the path-based file-bytes route at `<basePath>/.cms/files/<tree-path>` on
 * `runner`, delegating to `serveFilesRequest`. Called identically by Control
 * (pass the admin `authGuard` in `middlewares`) and Delivery (public, no
 * middleware) — the mount + prefix logic lives here once instead of in each app.
 *
 * The strip-prefix is derived from `runner.basePath`, so whatever tenant prefix
 * the runner is scoped under is handled automatically (`"/"` → `""`).
 */
export function registerFilesEndpoint(opts: {
    runner:       Runner;
    metadata:     CmsFilesMetadataRepository;
    blob:         CmsFilesBlobStore;
    middlewares?: Middleware[];
}): void {
    const base   = opts.runner.basePath === "/" ? "" : opts.runner.basePath;
    const prefix = `${base}/.cms/files/`;
    opts.runner.group("/.cms/files", (filesRunner) => {
        filesRunner.setDefaultEndpoint("GET", (req) =>
            serveFilesRequest({ metadata: opts.metadata, blob: opts.blob }, req, { prefix }));
    }, opts.middlewares);
}
