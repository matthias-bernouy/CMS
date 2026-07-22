import { HttpError } from "../../http.ts";
import { normalizePhone, stringValue } from "../../shipment/payload/index.ts";
import type { JsonRecord } from "../../shipment/types.ts";

export function settingsRowFromBody(body: JsonRecord): JsonRecord {
    const row: JsonRecord = {};
    setText(row, body, "modeCollection", "mode_collection", (value) =>
        requireOneOf(value.toUpperCase(), ["CCC"], "modeCollection"),
    );
    setText(row, body, "modeDelivery", "mode_delivery", (value) =>
        requireOneOf(value.toUpperCase(), ["24R"], "modeDelivery"),
    );
    setText(row, body, "senderName", "sender_name");
    setText(row, body, "senderFirstName", "sender_firstname");
    setText(row, body, "senderLastName", "sender_lastname");
    setText(row, body, "senderAddressLine1", "sender_address_line1");
    setText(row, body, "senderAddressLine2", "sender_address_line2");
    setText(row, body, "senderAddressLine3", "sender_address_line3");
    setText(row, body, "senderPostalCode", "sender_postal_code");
    setText(row, body, "senderCity", "sender_city");
    setText(row, body, "senderCountry", "sender_country", (value) =>
        requireOneOf(value.toUpperCase(), ["FR"], "senderCountry"),
    );
    const country =
        typeof row.sender_country === "string"
            ? row.sender_country
            : stringValue(body.senderCountry || "FR").toUpperCase();
    setText(row, body, "senderPhone", "sender_phone", (value) => normalizeSettingsPhone(value, country, "senderPhone"));
    setText(row, body, "senderMobile", "sender_mobile", (value) =>
        normalizeSettingsPhone(value, country, "senderMobile"),
    );
    setText(row, body, "senderEmail", "sender_email");
    setPositiveInteger(row, body, "defaultWeightGrams", "default_weight_grams");
    setText(row, body, "defaultPackageCount", "default_package_count", (value) =>
        requireOneOf(value, ["1"], "defaultPackageCount"),
    );
    setPositiveInteger(row, body, "defaultLengthCm", "default_length_cm");
    setPositiveInteger(row, body, "defaultWidthCm", "default_width_cm");
    setPositiveInteger(row, body, "defaultHeightCm", "default_height_cm");
    setText(row, body, "defaultContent", "default_content");
    setNonNegativeInteger(row, body, "defaultShippingAmount", "default_shipping_amount");
    setText(row, body, "declaredCurrency", "declared_currency", (value) =>
        requireOneOf(value.toUpperCase(), ["EUR"], "declaredCurrency"),
    );
    setText(row, body, "connectCulture", "connect_culture");
    setText(row, body, "connectVersionApi", "connect_version_api");
    setText(row, body, "connectOutputFormat", "connect_output_format");
    setText(row, body, "connectOutputType", "connect_output_type");
    return row;
}

function hasOwn(record: JsonRecord, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(record, key);
}

function setText(
    row: JsonRecord,
    body: JsonRecord,
    source: string,
    target: string,
    transform: (value: string) => string = (value) => value,
): void {
    if (!hasOwn(body, source)) {
        return;
    }
    row[target] = transform(stringValue(body[source]));
}

function setPositiveInteger(row: JsonRecord, body: JsonRecord, source: string, target: string): void {
    if (!hasOwn(body, source)) {
        return;
    }
    const value = Number(stringValue(body[source]));
    if (!Number.isInteger(value) || value < 1) {
        throw new HttpError(400, `${source} must be a positive integer`);
    }
    row[target] = value;
}

function setNonNegativeInteger(row: JsonRecord, body: JsonRecord, source: string, target: string): void {
    if (!hasOwn(body, source)) {
        return;
    }
    const value = Number(stringValue(body[source]));
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new HttpError(400, `${source} must be a non-negative safe integer`);
    }
    row[target] = value;
}

function requireOneOf(value: string, options: string[], name: string): string {
    if (!options.includes(value)) {
        throw new HttpError(400, `${name} must be ${options.join(" or ")}`);
    }
    return value;
}

function normalizeSettingsPhone(value: string, country: string, name: string): string {
    const normalized = normalizePhone(value, country);
    if (value && !normalized) {
        throw new HttpError(400, `${name} must use E.164 international format`);
    }
    if (normalized && !/^\+[1-9]\d{7,14}$/.test(normalized)) {
        throw new HttpError(400, `${name} must use E.164 international format`);
    }
    return normalized;
}
