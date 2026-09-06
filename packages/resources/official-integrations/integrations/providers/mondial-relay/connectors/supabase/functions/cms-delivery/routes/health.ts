import { envText } from "../env.ts";
import { HttpError, json, requireCmsRequest } from "../http.ts";
import { getOne } from "../shipment/supabase/client.ts";

export function health(request: Request): Response {
    requireCmsRequest(request);
    const configured = [
        "MONDIAL_RELAY_CONNECT_LOGIN",
        "MONDIAL_RELAY_CONNECT_PASSWORD",
        "MONDIAL_RELAY_TRACKING_PRIVATE_KEY",
    ].every((name) => Boolean(envText(name)));
    return json({
        schemaVersion: 1,
        status: configured ? "unknown" : "needs_configuration",
        checkedAt: new Date().toISOString(),
        checks: [
            {
                id: "connection",
                status: configured ? "unknown" : "warning",
                message: configured
                    ? "Run Source Health to verify provider credentials."
                    : "Configure the Mondial Relay connection in Source settings.",
            },
        ],
    });
}

export async function migrationHealth(request: Request): Promise<Response> {
    requireCmsRequest(request);
    const settings = await getOne("settings", { id: "default" }, "customer_reference,mode_collection");
    if (
        typeof settings?.customer_reference !== "string" ||
        !settings.customer_reference ||
        (settings.mode_collection !== "REL" && settings.mode_collection !== "CCC")
    ) {
        throw new HttpError(409, "migration settings are not ready");
    }
    return json({ ok: true });
}
