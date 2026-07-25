import { capturedFetches, jsonResponse, setRestResponder } from "../../../harness";

export function useMediaResponder(options: { attachFailure?: boolean; ambiguousAttachResult?: boolean } = {}): void {
    setRestResponder(async (request) => {
        const resource = new URL(request.url).pathname.split("/").at(-1)!;
        if (request.url.includes("/storage/v1/object/")) {
            return new Response(null, { status: 200 });
        }
        if (resource.startsWith("authorize_")) {
            const body = (await request.json()) as Record<string, unknown>;
            const ownerKey = resource === "authorize_offer_media_upload" ? "offer_id" : "product_id";
            const ownerParameter = resource === "authorize_offer_media_upload" ? "p_offer_id" : "p_product_id";
            return jsonResponse({
                state: "authorized",
                [ownerKey]: body[ownerParameter],
                replace_media_id: body.p_replace_media_id,
            });
        }
        if (resource.startsWith("attach_")) {
            if (options.attachFailure) {
                return jsonResponse({ message: "not_found: media target changed" }, 400);
            }
            if (options.ambiguousAttachResult) {
                return new Response("{", {
                    status: 200,
                    headers: { "content-type": "application/json" },
                });
            }
            const body = (await request.json()) as Record<string, unknown>;
            return jsonResponse({
                id: 101,
                media_id: 101,
                width: body.p_width,
                height: body.p_height,
            });
        }
        if (resource.startsWith("remove_")) {
            return jsonResponse({ media_id: 17, detached_at: "2026-07-24T10:00:00Z" });
        }
        throw new Error(`unexpected media request ${request.method} ${request.url}`);
    });
}

export function callKind(call: { url: string; method: string }): string {
    return call.url.includes("/storage/v1/object/")
        ? `storage:${call.method}`
        : new URL(call.url).pathname.split("/").at(-1)!;
}

export function objectPath(url: string): string {
    const marker = "/storage/v1/object/commerce-media/";
    return new URL(url).pathname.slice(marker.length).split("/").map(decodeURIComponent).join("/");
}

export function storageCalls(): ReturnType<typeof capturedFetches> {
    return capturedFetches().filter((call) => call.url.includes("/storage/v1/object/"));
}
