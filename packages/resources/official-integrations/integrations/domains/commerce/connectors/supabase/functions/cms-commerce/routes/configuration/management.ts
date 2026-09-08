import { HttpError } from "../../core/errors.ts";
import { json } from "../../core/http.ts";
import { isRecord, readJsonObject } from "../../core/records.ts";
import { consentRequest } from "../order/payment/consent/client.ts";
import { getSettings } from "./index.ts";

export async function manageCommerce(request: Request): Promise<Response> {
    const invocation = await readJsonObject(request);
    if (invocation.operation !== "health") {
        throw new HttpError(400, "Unsupported Commerce management operation");
    }
    const response = await getSettings();
    const values = await response.json();
    if (!isRecord(values)) {
        throw new HttpError(502, "invalid Commerce settings response");
    }
    const revision = String(values.version);
    let consentAvailable = false;
    try {
        const consent = await consentRequest("/management", { operation: "health", input: {} });
        consentAvailable = consent.schemaVersion === 1 && consent.status === "ready";
    } catch {
        consentAvailable = false;
    }
    return json({
        schemaVersion: 1,
        status: consentAvailable ? "ready" : "degraded",
        checkedAt: new Date().toISOString(),
        configuration: { savedRevision: revision, appliedRevision: revision },
        checks: [
            { id: "storage", status: "ok", code: "storage_available" },
            {
                id: "consent",
                status: consentAvailable ? "ok" : "error",
                code: consentAvailable ? "consent_available" : "checkout_consent_unavailable",
            },
        ],
    });
}
