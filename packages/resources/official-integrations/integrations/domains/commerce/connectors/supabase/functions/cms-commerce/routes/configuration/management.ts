import { HttpError } from "../../core/errors.ts";
import { json } from "../../core/http.ts";
import { isRecord, readJsonObject } from "../../core/records.ts";
import { consentRequest } from "../order/payment/consent/client.ts";
import { getSettings, updateSettings } from "./index.ts";

export async function manageCommerce(request: Request): Promise<Response> {
    const invocation = await readJsonObject(request);
    const input = isRecord(invocation.input) ? invocation.input : {};
    let response: Response;
    if (invocation.operation === "save-settings") {
        const values = isRecord(input.values) ? input.values : input;
        response = await updateSettings(
            new Request(request.url, {
                method: "POST",
                headers: request.headers,
                body: JSON.stringify({
                    ...values,
                    expectedVersion: Number(input.expectedRevision ?? values.expectedVersion),
                }),
            }),
        );
    } else if (["read-settings", "health"].includes(String(invocation.operation))) {
        response = await getSettings();
    } else {
        throw new HttpError(400, "unsupported Commerce management operation");
    }
    const values = await response.json();
    if (!isRecord(values)) {
        throw new HttpError(502, "invalid Commerce settings response");
    }
    const revision = String(values.version);
    if (invocation.operation !== "health") {
        return json({ values, savedRevision: revision, appliedRevision: revision });
    }
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
