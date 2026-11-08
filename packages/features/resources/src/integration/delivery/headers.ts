import { securityHeaders } from "@bernouy/http-runner";
import type { ResourceAssetMetadata } from "resources/storage/records";

export function resourceAssetHeaders(asset: ResourceAssetMetadata, versioned: boolean): Headers {
    return new Headers({
        ...securityHeaders({ crossOriginResourcePolicy: "cross-origin" }),
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": versioned ? "public, max-age=31536000, immutable" : "public, no-cache",
        "Accept-Ranges": "bytes",
        "Content-Disposition":
            /^(?:image|audio|video|font)\//u.test(asset.mediaType) || asset.mediaType === "application/pdf"
                ? "inline"
                : "attachment",
        "Content-Length": String(asset.byteLength),
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        "Content-Type": asset.mediaType,
        ETag: `"${asset.digest}"`,
    });
}
