import MissingParam from "cms-control/core/admin/http/errors/MissingParam";

export type PageCreateDto = {
    title: string;
    path: string;
    sourcePath?: string;
};

/**
 * Extract the page-create body into a typed DTO. Only checks presence
 * (`MissingParam`) and coerces shape — the domain rules (title/path format)
 * are enforced by `ValidatingCmsRepository` at write time.
 */
export function parsePageCreateDto(body: Record<string, unknown>): PageCreateDto {
    const { title, path } = body;
    if (!title) {
        throw new MissingParam("title");
    }
    if (!path) {
        throw new MissingParam("path");
    }
    const sourcePath = body.sourcePath == null ? "" : String(body.sourcePath).trim();
    return {
        title: String(title),
        path: String(path),
        ...(sourcePath ? { sourcePath } : {}),
    };
}
