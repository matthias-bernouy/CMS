import { localProviderSimulationEnabled, requiredEnv } from "../../env.ts";
import { ProviderStatusError } from "../../http.ts";
import type { ConnectShipmentResult, ConnectStatus, JsonRecord, ShipmentPayload } from "../../shipment/types.ts";
import { validatedMondialRelayLabelUrl } from "../label-url.ts";
import { mondialRelayConnectEndpoint } from "../provider-endpoints.ts";
import { xmlAttr, xmlTag } from "../xml.ts";
import { connectShipmentXml } from "./request.ts";
import { connectStatuses, connectStatusMessage, relayPointInfo } from "./response.ts";

export async function createConnectShipment(payload: ShipmentPayload): Promise<ConnectShipmentResult> {
    const endpoint = mondialRelayConnectEndpoint();
    if (localProviderSimulationEnabled()) {
        const expeditionNumber = localExpeditionNumber(payload.externalOrderId);
        const statuses = [{ code: "0", level: "Success", message: "Local Ulvia simulation" }];
        return {
            expeditionNumber,
            labelUrl: "",
            raw: { statuses, modeSandbox: true, relayPointInfo: { ModeSandbox: "True" } },
            statuses,
            relayPointInfo: { ModeSandbox: "True" },
        };
    }
    const requestXml = connectShipmentXml(payload);
    const response = await fetch(endpoint, {
        method: "POST",
        redirect: "manual",
        headers: {
            accept: "application/xml",
            "content-type": "text/xml",
        },
        body: requestXml,
    }).catch(() => {
        throw new ProviderStatusError(502, "Mondial Relay Connect request failed", providerContext(payload, [], false));
    });
    if (response.redirected || (response.status >= 300 && response.status < 400)) {
        throw new ProviderStatusError(
            502,
            "Mondial Relay Connect redirects are not allowed",
            providerContext(payload, [], false),
        );
    }
    const text = await response.text();
    if (!response.ok) {
        throw new ProviderStatusError(
            502,
            `Mondial Relay Connect returned HTTP ${response.status}`,
            providerContext(payload, [], false),
        );
    }

    const statuses = connectStatuses(text);
    const blocking = statuses.find((status) => /error|critical/i.test(status.level));
    if (blocking) {
        throw new ProviderStatusError(
            502,
            `Mondial Relay Connect returned status ${blocking.code}: ${blocking.message || connectStatusMessage(blocking.code)}`,
            providerContext(payload, statuses, true),
        );
    }

    const expeditionNumber = xmlAttr(text, "Shipment", "ShipmentNumber");
    const rawLabelUrl = xmlTag(text, "Output");
    if (!expeditionNumber) {
        throw new ProviderStatusError(
            502,
            "Mondial Relay Connect did not return a shipment number",
            providerContext(payload, statuses, false),
        );
    }
    const labelUrl = rawLabelUrl ? validatedMondialRelayLabelUrl(rawLabelUrl).toString() : "";

    return {
        expeditionNumber,
        labelUrl,
        raw: {
            statuses,
            modeSandbox: text.includes('Key="ModeSandbox" Value="True"'),
            relayPointInfo: relayPointInfo(text),
        },
        statuses,
        relayPointInfo: relayPointInfo(text),
    };
}

function localExpeditionNumber(value: string): string {
    let hash = 0;
    for (const code of new TextEncoder().encode(value)) {
        hash = (Math.imul(hash, 31) + code) >>> 0;
    }
    return String(hash % 100_000_000).padStart(8, "0");
}

function providerContext(payload: ShipmentPayload, statuses: ConnectStatus[], retrySafe: boolean): JsonRecord {
    return {
        operation: "ShipmentCreationRequest",
        endpoint: mondialRelayConnectEndpoint(),
        statuses,
        retrySafe,
        fields: {
            customerId: requiredEnv("MONDIAL_RELAY_CONNECT_CUSTOMER_ID"),
            modeCollection: payload.modeCollection,
            modeDelivery: payload.modeDelivery,
            deliveryRelayLocation: payload.deliveryRelayLocation,
            weightGrams: payload.weightGrams,
        },
    };
}
