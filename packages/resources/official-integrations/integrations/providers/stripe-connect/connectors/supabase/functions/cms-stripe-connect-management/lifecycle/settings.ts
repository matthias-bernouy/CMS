import { HttpError, isRecord, type JsonRecord } from "../core/runtime.ts";
import { readSettings, settingsResult, updateSettings } from "./store.ts";

const defaults = {
    sellerPayoutSchedule: "daily",
    defaultCountry: "FR",
    defaultCurrency: "eur",
    sellerActivityDescription: "Sale of second-hand goods between individuals through an online marketplace.",
};
const fields = ["stripeSecretKey", "stripePublishableKey", ...Object.keys(defaults)];
export async function saveSettings(input: JsonRecord) {
    const current = await readSettings();
    if (current.operation === "applying" || current.operation === "pending_sync") {
        throw new HttpError(409, "Finish applying the saved settings before saving again");
    }
    if (input.expectedRevision !== current.saved_revision) {
        throw new HttpError(409, "Settings revision changed");
    }
    const values = isRecord(input.values) ? input.values : input;
    const next: JsonRecord = { ...defaults };
    for (const key of Object.keys(values)) {
        if (key === "expectedRevision") {
            continue;
        }
        if (!fields.includes(key)) {
            throw new HttpError(422, "Unknown settings field");
        }
        if (typeof values[key] !== "string" || values[key].length > 500) {
            throw new HttpError(422, "Invalid settings value");
        }
        next[key] = values[key].trim();
    }
    for (const name of ["stripeSecretKey", "stripePublishableKey"]) {
        if (next[name] && !/^\$\{[A-Za-z0-9_-]+\}$/.test(String(next[name]))) {
            throw new HttpError(422, "Select a secret reference for Stripe credentials");
        }
    }
    if (!["daily", "manual"].includes(String(next.sellerPayoutSchedule))) {
        throw new HttpError(422, "Unsupported seller payout schedule");
    }
    if (
        next.defaultCountry !== "FR" ||
        next.defaultCurrency !== "eur" ||
        !next.sellerActivityDescription ||
        String(next.sellerActivityDescription).length > 400
    ) {
        throw new HttpError(422, "Unsupported country, currency, or empty activity description");
    }
    return settingsResult(
        await updateSettings(current, { values: next, saved_revision: crypto.randomUUID(), operation: "idle" }),
    );
}
export function validateCredentials(secrets: JsonRecord): string {
    const secret = String(secrets.stripeSecretKey ?? "");
    const publishable = String(secrets.stripePublishableKey ?? "");
    const mode = secret.startsWith("sk_test_") ? "test" : secret.startsWith("sk_live_") ? "live" : null;
    if (!mode || !publishable.startsWith(`pk_${mode}_`)) {
        throw new HttpError(422, "Select valid Stripe keys with matching test or live modes");
    }
    return secret;
}
