import type { ControlCms } from "cms-control/ControlCms";
import { isPresentationImageBytes, presentationImageContentType } from "@bernouy/cms-content";
import { siteBlocTag } from "cms-control/core/content/siteBloc/dto";

/** Serves only the image declared by the current persisted bloc artifact. */
export default async function getBlocThumbnail(req: Request, cms: ControlCms): Promise<Response> {
    const artifact = (await cms.repository.getBlocRecord(siteBlocTag(req.url)))?.artifact;
    const path = artifact?.thumbnail?.path;
    const encoded = path ? artifact?.source?.[path] : undefined;
    const contentType = path ? presentationImageContentType(path) : null;
    const headers = {
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
    };
    if (!encoded || !contentType) {
        return new Response("Thumbnail not found", { status: 404, headers });
    }
    const bytes = Buffer.from(encoded, "base64");
    if (!isPresentationImageBytes(bytes, contentType)) {
        return new Response("Invalid thumbnail image", { status: 415, headers });
    }
    return new Response(bytes, { headers: { ...headers, "Content-Type": contentType } });
}
