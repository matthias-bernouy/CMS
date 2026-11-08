import type { RepositoryCapabilityPorts } from "cms-repository/repository/capabilities/interfaces";

/** Keep immutable representation metadata without buffering the publication stream. */
export function downloadResponse(
    download: NonNullable<Awaited<ReturnType<RepositoryCapabilityPorts["release"]>>>,
    asset: boolean,
): Response {
    return new Response(download.stream, {
        headers: {
            "content-type": asset ? "application/octet-stream" : download.contentType,
            "content-length": String(download.contentLength),
            etag: `"${download.digest}"`,
            "cache-control": "public, max-age=31536000, immutable",
        },
    });
}
