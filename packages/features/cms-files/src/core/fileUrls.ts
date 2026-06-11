export const CMS_FILES_ROUTE = "/.cms/files";
export const CMS_FILES_BY_ID_SEGMENT = "by-id";
export const CMS_FILES_BY_ID_ROUTE = `${CMS_FILES_ROUTE}/${CMS_FILES_BY_ID_SEGMENT}`;
export const CMS_IMAGE_VARIANT_ROUTE = "/.cms/img";

const CMS_FILES_BY_ID_MARKER = `${CMS_FILES_BY_ID_ROUTE}/`;

function joinBase(base: string, path: string): string {
    const b = base === "/" ? "" : base.replace(/\/$/, "");
    return `${b}${path}`;
}

export function filesPrefix(basePath: string): string {
    return `${joinBase(basePath, CMS_FILES_ROUTE)}/`;
}

export function imageVariantPrefix(basePath: string): string {
    return `${joinBase(basePath, CMS_IMAGE_VARIANT_ROUTE)}/`;
}

export function cmsFilesByIdPath(id: string): string {
    return `${CMS_FILES_BY_ID_ROUTE}/${encodeURIComponent(id)}`;
}

export function cmsFilesByIdUrl(base: string, id: string): string {
    return joinBase(base, cmsFilesByIdPath(id));
}

export function cmsImageVariantPath(id: string, width: number): string {
    return `${CMS_IMAGE_VARIANT_ROUTE}/${encodeURIComponent(id)}/${width}.webp`;
}

export function cmsImageVariantUrl(base: string, id: string, width: number): string {
    return joinBase(base, cmsImageVariantPath(id, width));
}

export function withFileVersion(url: string, hash: string): string {
    return url.includes("?") ? `${url}&v=${hash}` : `${url}?v=${hash}`;
}

export type CmsFilesByIdUrl = { id: string; prefix: string };

export function mediaIdFromUrl(urlOrPath: string): string | null {
    return parseCmsFilesByIdUrl(urlOrPath)?.id ?? null;
}

export function isCmsFilesByIdUrl(urlOrPath: string): boolean {
    return parseCmsFilesByIdUrl(urlOrPath) !== null;
}

export function cmsFilesByIdRef(id: string): string {
    return `by-id/${encodeURIComponent(id)}`;
}

export function cmsImageVariantUrlFromByIdUrl(byIdUrl: string, width: number): string | null {
    const base = cmsImageVariantBaseUrlFromByIdUrl(byIdUrl);
    if (!base) return null;
    return `${base}/${width}.webp`;
}

export function cmsImageVariantBaseUrlFromByIdUrl(byIdUrl: string): string | null {
    const parsed = parseCmsFilesByIdUrl(byIdUrl);
    if (!parsed) return null;
    return `${parsed.prefix}${CMS_IMAGE_VARIANT_ROUTE}/${encodeURIComponent(parsed.id)}`;
}

export function parseCmsFilesByIdUrl(urlOrPath: string): CmsFilesByIdUrl | null {
    const idx = urlOrPath.indexOf(CMS_FILES_BY_ID_MARKER);
    if (idx < 0) return null;

    const idStart = idx + CMS_FILES_BY_ID_MARKER.length;
    const idEnd = findIdEnd(urlOrPath, idStart);
    const encodedId = urlOrPath.slice(idStart, idEnd);
    if (!encodedId) return null;

    try {
        return { id: decodeURIComponent(encodedId), prefix: urlOrPath.slice(0, idx) };
    } catch {
        return null;
    }
}

function findIdEnd(urlOrPath: string, start: number): number {
    const queryIdx = urlOrPath.indexOf("?", start);
    const hashIdx = urlOrPath.indexOf("#", start);
    const slashIdx = urlOrPath.indexOf("/", start);
    return Math.min(...[queryIdx, hashIdx, slashIdx].filter((idx) => idx >= 0), urlOrPath.length);
}
