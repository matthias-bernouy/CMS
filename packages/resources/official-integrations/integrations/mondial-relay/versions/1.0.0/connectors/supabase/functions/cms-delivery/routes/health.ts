import { envDefault, envText, printableAscii } from "../env.ts";
import { json, requireCmsRequest } from "../http.ts";
import { mondialRelayConnectEndpoint } from "../provider/provider-endpoints.ts";

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
