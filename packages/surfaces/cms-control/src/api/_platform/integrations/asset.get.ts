import type { ControlCms } from "cms-control/ControlCms";
import MissingParam from "cms-control/core/admin/http/errors/MissingParam";
import { presentationImageContentType, isPresentationImageBytes } from "@bernouy/cms-content";

export default async function getIntegrationAsset(req: Request, cms: ControlCms): Promise<Response> {
    const url = new URL(req.url);
    const kind = requiredSearchParam(url, "kind");
    const path = requiredSearchParam(url, "path");
    const version = optionalText(url.searchParams.get("version"));
    const expectedType = presentationImageContentType(path);
    if (!expectedType) {
        return new Response("Not found", { status: 404 });
    }
    const asset = await cms.integrationCatalog.getAsset?.(kind, version, path);
    if (!asset) {
        return new Response("Not found", { status: 404 });
    }
    if (
        asset.contentType.split(";")[0]?.trim().toLowerCase() !== expectedType ||
        !isPresentationImageBytes(asset.bytes, expectedType)
    ) {
        return new Response("Invalid image asset", { status: 415 });
    }

    return new Response(arrayBuffer(asset.bytes), {
        headers: {
            "cache-control": version ? "private, max-age=3600" : "private, no-store",
            "content-type": asset.contentType,
            "x-content-type-options": "nosniff",
            "content-security-policy": "default-src 'none'; sandbox",
        },
    });
}

function arrayBuffer(bytes: Uint8Array): ArrayBuffer {
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    return buffer;
}

function requiredSearchParam(url: URL, name: string): string {
    const value = optionalText(url.searchParams.get(name));
    if (!value) {
        throw new MissingParam(name);
    }
    return value;
}

function optionalText(value: string | null): string | undefined {
    return value && value.trim() ? value.trim() : undefined;
}
