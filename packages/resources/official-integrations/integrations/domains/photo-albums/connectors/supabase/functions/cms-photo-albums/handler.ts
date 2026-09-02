import { requireCmsRequest } from "./core/auth.ts";
import { handleError, json, optionsResponse } from "./core/http.ts";
import { handleAlbumRoute } from "./routes/albums.ts";
import { handleCategoryRoute } from "./routes/categories.ts";
import { handlePhotoRoute } from "./routes/photos.ts";
import { handleSettingsRoute } from "./routes/settings.ts";
import { handleSetupRoute } from "./routes/setup.ts";

const routeHandlers = [handleSetupRoute, handleCategoryRoute, handleAlbumRoute, handlePhotoRoute, handleSettingsRoute];

export async function handlePhotoAlbumsRequest(request: Request): Promise<Response> {
    try {
        if (request.method === "OPTIONS") {
            return optionsResponse();
        }
        await requireCmsRequest(request);
        const route = routePath(request);
        for (const handler of routeHandlers) {
            const response = await handler(route, request);
            if (response) {
                return response;
            }
        }
        return json({ error: "not found" }, 404);
    } catch (error) {
        return handleError(error);
    }
}

function routePath(request: Request): string {
    const pathname = new URL(request.url).pathname.replace(/\/+$/, "");
    const marker = "/cms-photo-albums";
    const index = pathname.indexOf(marker);
    if (index === -1) {
        return pathname || "/";
    }
    return pathname.slice(index + marker.length) || "/";
}
