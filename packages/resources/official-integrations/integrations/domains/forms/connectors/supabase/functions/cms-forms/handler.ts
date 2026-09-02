import { requireCmsRequest } from "./auth.ts";
import { handleError, json, optionsResponse } from "./http.ts";
import { handleAdminRoute } from "./routes/admin.ts";
import { handleBuilderRoute } from "./routes/builder.ts";
import { handleMediaRoute } from "./routes/media/index.ts";
import { handleSubmissionRoute } from "./routes/submissions.ts";
import { handleSystemRoute } from "./routes/system.ts";
import { handleVisitorRoute } from "./routes/visitor.ts";

const handlers = [
    handleMediaRoute,
    handleVisitorRoute,
    handleBuilderRoute,
    handleSubmissionRoute,
    handleAdminRoute,
    handleSystemRoute,
];

export async function handleFormsRequest(request: Request): Promise<Response> {
    try {
        if (request.method === "OPTIONS") {
            return optionsResponse();
        }
        requireCmsRequest(request);
        const route = routePath(request);
        for (const handler of handlers) {
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
    const marker = "/cms-forms";
    const index = pathname.indexOf(marker);
    return index === -1 ? pathname || "/" : pathname.slice(index + marker.length) || "/";
}
