import { stringValue } from "../../shipment/payload/index.ts";
import type { DeliverySettings, JsonRecord } from "../../shipment/types.ts";

export function settingsJson(row: JsonRecord | null): JsonRecord {
    const settings = settingsFromRow(row);
    return {
        id: settings.id,
        modeCollection: settings.modeCollection,
        modeDelivery: settings.modeDelivery,
        senderName: settings.sender.name,
        senderFirstName: settings.sender.firstName,
        senderLastName: settings.sender.lastName,
        senderAddressLine1: settings.sender.addressLine1,
        senderAddressLine2: settings.sender.addressLine2,
        senderAddressLine3: settings.sender.addressLine3,
        senderPostalCode: settings.sender.postalCode,
        senderCity: settings.sender.city,
        senderCountry: settings.sender.country,
        senderPhone: settings.sender.phone,
        senderMobile: settings.sender.mobile,
        senderEmail: settings.sender.email,
        defaultWeightGrams: settings.defaultWeightGrams,
        defaultPackageCount: settings.defaultPackageCount,
        defaultLengthCm: settings.defaultLengthCm,
        defaultWidthCm: settings.defaultWidthCm,
        defaultHeightCm: settings.defaultHeightCm,
        defaultContent: settings.defaultContent,
        defaultShippingAmount: settings.defaultShippingAmount,
        declaredCurrency: settings.declaredCurrency,
        connectCulture: settings.connectCulture,
        connectVersionApi: settings.connectVersionApi,
        connectOutputFormat: settings.connectOutputFormat,
        connectOutputType: settings.connectOutputType,
        createdAt: stringValue(row?.created_at),
        updatedAt: stringValue(row?.updated_at),
    };
}

export function settingsFromRow(row: JsonRecord | null): DeliverySettings {
    return {
        id: rowText(row, "id", "default"),
        modeCollection: rowText(row, "mode_collection", "CCC").toUpperCase(),
        modeDelivery: rowText(row, "mode_delivery", "24R").toUpperCase(),
        sender: {
            name: rowText(row, "sender_name", ""),
            firstName: rowText(row, "sender_firstname", ""),
            lastName: rowText(row, "sender_lastname", ""),
            addressLine1: rowText(row, "sender_address_line1", ""),
            addressLine2: rowText(row, "sender_address_line2", ""),
            addressLine3: rowText(row, "sender_address_line3", ""),
            city: rowText(row, "sender_city", ""),
            postalCode: rowText(row, "sender_postal_code", ""),
            country: rowText(row, "sender_country", "FR").toUpperCase(),
            phone: rowText(row, "sender_phone", ""),
            mobile: rowText(row, "sender_mobile", ""),
            email: rowText(row, "sender_email", ""),
        },
        defaultWeightGrams: rowInteger(row, "default_weight_grams", 500),
        defaultPackageCount: rowInteger(row, "default_package_count", 1),
        defaultLengthCm: rowInteger(row, "default_length_cm", 30),
        defaultWidthCm: rowInteger(row, "default_width_cm", 20),
        defaultHeightCm: rowInteger(row, "default_height_cm", 10),
        defaultContent: rowText(row, "default_content", "Products"),
        defaultShippingAmount: rowNonNegativeInteger(row, "default_shipping_amount", 450),
        declaredCurrency: rowText(row, "declared_currency", "EUR").toUpperCase(),
        connectCulture: rowText(row, "connect_culture", "fr-FR"),
        connectVersionApi: rowText(row, "connect_version_api", "1.0"),
        connectOutputFormat: rowText(row, "connect_output_format", "10x15"),
        connectOutputType: rowText(row, "connect_output_type", "PdfUrl"),
        createdAt: stringValue(row?.created_at),
        updatedAt: stringValue(row?.updated_at),
    };
}

function rowText(row: JsonRecord | null, key: string, fallback: string): string {
    return stringValue(row?.[key]) || fallback;
}

function rowInteger(row: JsonRecord | null, key: string, fallback: number): number {
    const value = Number(row?.[key]);
    return Number.isInteger(value) && value > 0 ? value : fallback;
}

function rowNonNegativeInteger(row: JsonRecord | null, key: string, fallback: number): number {
    const value = Number(row?.[key]);
    return Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}
