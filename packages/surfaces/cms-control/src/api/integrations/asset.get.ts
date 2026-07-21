import type { ControlCms } from "cms-control/ControlCms";
import MissingParam from "cms-control/errors/Http/MissingParam";

export default async function getIntegrationAsset(req: Request, cms: ControlCms): Promise<Response> {
    const url = new URL(req.url);
    const kind = requiredSearchParam(url, "kind");
    const path = requiredSearchParam(url, "path");
    const version = optionalText(url.searchParams.get("version"));
    const asset = await cms.integrationCatalog.getAsset?.(kind, version, path);
    if (!asset) {
        return new Response("Not found", { status: 404 });
    }

    return new Response(arrayBuffer(asset.bytes), {
        headers: {
            "cache-control": "private, max-age=3600",
            "content-type": asset.contentType,
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
