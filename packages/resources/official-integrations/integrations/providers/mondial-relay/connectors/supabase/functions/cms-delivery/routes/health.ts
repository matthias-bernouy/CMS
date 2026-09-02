import { envDefault, envText, printableAscii } from "../env.ts";
import { HttpError, json, requireCmsRequest } from "../http.ts";
import { mondialRelayConnectEndpoint } from "../provider/provider-endpoints.ts";
import { getOne } from "../shipment/supabase/client.ts";

export function health(request: Request): Response {
    requireCmsRequest(request);
    const password = envText("MONDIAL_RELAY_CONNECT_PASSWORD");
    return json({
        ok: true,
        mondialRelay: {
            api: "connect-v2",
            endpoint: mondialRelayConnectEndpoint(),
            loginConfigured: envText("MONDIAL_RELAY_CONNECT_LOGIN").length > 0,
            customerId: envText("MONDIAL_RELAY_CONNECT_CUSTOMER_ID"),
            passwordConfigured: password.length > 0,
            passwordLength: password.length,
            passwordPrintableAscii: printableAscii(password),
            widgetBrand: envDefault("MONDIAL_RELAY_WIDGET_BRAND", envText("MONDIAL_RELAY_CONNECT_CUSTOMER_ID")),
            settingsSchema: "delivery",
            settingsTable: "settings",
        },
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
