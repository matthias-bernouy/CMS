import { json, methodNotAllowed } from "../core/http.ts";
import { camelize, readJsonObject, requiredBoolean, requiredInteger, requiredText } from "../core/records.ts";
import { rpc } from "../core/rest.ts";

export async function handleSettingsRoute(route: string, request: Request): Promise<Response | null> {
    if (route !== "/settings") {
        return null;
    }
    if (request.method === "GET") {
        return json(camelize(await rpc("get_settings")));
    }
    if (request.method === "POST") {
        const body = await readJsonObject(request);
        const result = await rpc("update_settings", {
            p_gallery_title: requiredText(body.galleryTitle, "galleryTitle"),
            p_default_page_size: requiredInteger(body.defaultPageSize, "defaultPageSize"),
            p_max_photos_per_album: requiredInteger(body.maxPhotosPerAlbum, "maxPhotosPerAlbum"),
            p_allow_downloads: requiredBoolean(body.allowDownloads, "allowDownloads"),
            p_show_captions: requiredBoolean(body.showCaptions, "showCaptions"),
            p_show_taken_at: requiredBoolean(body.showTakenAt, "showTakenAt"),
            p_expected_version: requiredInteger(body.version, "version"),
        });
        return json(camelize(result));
    }
    return methodNotAllowed("GET", "POST");
}
