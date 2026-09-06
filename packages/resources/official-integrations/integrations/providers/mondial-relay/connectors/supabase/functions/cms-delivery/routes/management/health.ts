import { localProviderSimulationEnabled } from "../../env.ts";
import { md5 } from "../../provider/md5.ts";
import { xmlEscape, xmlTag } from "../../provider/xml.ts";
import { mondialRelayTrackingProductionEndpoint } from "../../provider/provider-endpoints.ts";
import type { JsonRecord } from "../../shipment/types.ts";
import { configured } from "./settings.ts";
import { readSettings } from "./store.ts";

export async function verifyTracking(values: JsonRecord, secrets: JsonRecord): Promise<boolean> {
    if (Deno.env.get("ULVIA_LOCAL_PROVIDER_SIMULATION") === "v1") {
        return localProviderSimulationEnabled(
            (name) =>
                (({
                    MONDIAL_RELAY_CONNECT_LOGIN: values.mondialRelayConnectLogin,
                    MONDIAL_RELAY_CONNECT_PASSWORD: secrets.mondialRelayConnectPassword,
                    MONDIAL_RELAY_CONNECT_CUSTOMER_ID: values.mondialRelayConnectCustomerId,
                })[name] as string) ??
                Deno.env.get(name) ??
                "",
        );
    }
    const brand = String(values.mondialRelayTrackingBrand ?? "");
    const key = String(secrets.mondialRelayTrackingPrivateKey ?? "");
    if (!brand || !key) {
        return false;
    }
    const security = md5(`${brand}FRPARIS750011${key}`).toUpperCase();
    const response = await fetch(mondialRelayTrackingProductionEndpoint, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(15000),
        headers: {
            "content-type": "text/xml; charset=utf-8",
            soapaction: "http://www.mondialrelay.fr/webservice/WSI2_RechercheCP",
        },
        body: `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><WSI2_RechercheCP xmlns="http://www.mondialrelay.fr/webservice/"><Enseigne>${xmlEscape(brand)}</Enseigne><Pays>FR</Pays><Ville>PARIS</Ville><CP>75001</CP><NbResult>1</NbResult><Security>${security}</Security></WSI2_RechercheCP></soap:Body></soap:Envelope>`,
    });
    return response.ok && xmlTag(await response.text(), "STAT") === "0";
}
export async function sourceHealth(secrets: JsonRecord) {
    const settings = await readSettings();
    const complete = configured(settings.values, secrets);
    const checks: JsonRecord[] = [];
    let status = "needs_configuration";
    if (!complete) {
        checks.push({
            id: "connection",
            status: "warning",
            code: "connection_incomplete",
            message: "Complete the Mondial Relay Connection settings.",
        });
    } else {
        try {
            const valid = await verifyTracking(settings.values, secrets);
            checks.push({
                id: "tracking_credentials",
                status: valid ? "ok" : "error",
                code: valid ? "credentials_validated" : "credentials_rejected",
                message: valid
                    ? "Tracking credentials verified by a postal code lookup."
                    : "Mondial Relay rejected the tracking credential check.",
            });
            status = valid ? "degraded" : "blocked";
        } catch {
            checks.push({
                id: "tracking_credentials",
                status: "unknown",
                code: "provider_unreachable",
                message: "Tracking credentials could not be checked.",
            });
            status = "degraded";
        }
        checks.push({
            id: "connect_credentials",
            status: "unknown",
            code: "no_read_only_authentication_probe",
            message:
                "Connect only exposes label creation. Credential validity is checked when creating a real shipment; Health does not create labels.",
        });
    }
    if (settings.saved_revision !== settings.applied_revision || !settings.applied_revision) {
        checks.push({
            id: "configuration",
            status: "warning",
            code: "settings_not_applied",
            message: "Apply saved Connection settings.",
            actionIds: ["apply-settings"],
        });
        if (status !== "blocked") {
            status = "needs_configuration";
        }
    }
    return {
        schemaVersion: 1,
        status,
        checkedAt: new Date().toISOString(),
        configuration: { savedRevision: settings.saved_revision, appliedRevision: settings.applied_revision },
        checks,
    };
}
