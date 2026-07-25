import type { SourceEndpoint } from "@bernouy/cms-sources";

export type RequestedTransform =
    | { kind: "passthrough"; reason: "not_requested" }
    | {
          kind: "reject";
          reason: "unsupported_parameter" | "invalid_width" | "range_request" | "ineligible_endpoint";
          response: Response;
      }
    | { kind: "transform"; width: number; request: Request };

const DECLARED_RASTER_MEDIA = new Set([
    "image/*",
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/avif",
]);

export function requestedSourceImageTransform(
    endpoint: SourceEndpoint,
    request: Request,
    widths: readonly number[],
): RequestedTransform {
    const url = new URL(request.url);
    const reserved = [...url.searchParams.keys()].filter((name) => name.trim().toLowerCase().startsWith("cms-"));
    if (reserved.length === 0) {
        return { kind: "passthrough", reason: "not_requested" };
    }
    if (reserved.length !== 1 || reserved[0] !== "cms-width") {
        return reject("unsupported_parameter", "unsupported CMS image parameter");
    }
    const values = url.searchParams.getAll("cms-width");
    const raw = values.length === 1 ? values[0] : null;
    const width = raw && /^[1-9]\d*$/.test(raw) ? Number(raw) : Number.NaN;
    if (!Number.isSafeInteger(width) || String(width) !== raw || !widths.includes(width)) {
        return reject("invalid_width", "unsupported CMS image width");
    }
    if (!isEligibleEndpoint(endpoint)) {
        return reject("ineligible_endpoint", "endpoint does not support CMS image transforms");
    }
    if (request.headers.has("range")) {
        return reject("range_request", "Range is incompatible with CMS image transforms");
    }
    url.searchParams.delete("cms-width");
    return { kind: "transform", width, request: new Request(url, request) };
}

export function isEligibleEndpoint(endpoint: SourceEndpoint): boolean {
    const mediaType = endpoint.mediaType?.split(";", 1)[0]?.trim().toLowerCase();
    return (
        endpoint.method === "GET" &&
        endpoint.responseKind === "file" &&
        mediaType !== undefined &&
        DECLARED_RASTER_MEDIA.has(mediaType)
    );
}

function reject(
    reason: Extract<RequestedTransform, { kind: "reject" }>["reason"],
    message: string,
): RequestedTransform {
    return { kind: "reject", reason, response: new Response(message, { status: 400 }) };
}
