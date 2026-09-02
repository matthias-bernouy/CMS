import { requireCmsAdmin } from "../core/auth.ts";
import { HttpError } from "../core/errors.ts";
import { listNotificationDeliveries, notificationConfiguration } from "../routes/notifications/admin.ts";
import { claimNotifications, completeNotification, failNotification } from "../routes/notifications/dispatch.ts";
import { notificationPreferences } from "../routes/notifications/preferences.ts";
import { notificationTemplates } from "../routes/notifications/templates.ts";

export async function handleNotificationRoute(route: string, request: Request): Promise<Response | null> {
    if (route === "/notifications/preferences") {
        return await notificationPreferences(request);
    }
    if (route === "/notifications/templates" && request.method === "GET") {
        return notificationTemplates();
    }
    if (route === "/notifications/system/claim" && request.method === "POST") {
        return await claimNotifications(request);
    }
    if (route === "/notifications/system/complete" && request.method === "POST") {
        return await completeNotification(request);
    }
    if (route === "/notifications/system/fail" && request.method === "POST") {
        return await failNotification(request);
    }
    if (route === "/notifications/admin/deliveries" && request.method === "GET") {
        requireCmsAdmin(request);
        return await listNotificationDeliveries(request);
    }
    if (route === "/notifications/admin/configuration" && ["GET", "POST"].includes(request.method)) {
        requireCmsAdmin(request);
        return await notificationConfiguration(request);
    }
    if (route.startsWith("/notifications/")) {
        throw new HttpError(404, "notification route not found");
    }
    return null;
}
