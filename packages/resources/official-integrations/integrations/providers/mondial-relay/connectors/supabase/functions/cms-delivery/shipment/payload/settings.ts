import { envDefault } from "../../env.ts";
import type { DeliverySettings } from "../types.ts";

export function fallbackSettings(): DeliverySettings {
    const senderPhone = envDefault("MONDIAL_RELAY_SENDER_PHONE", "");
    return {
        id: "default",
        modeCollection: envDefault("MONDIAL_RELAY_DEFAULT_MODE_COL", "REL"),
        modeDelivery: envDefault("MONDIAL_RELAY_DEFAULT_MODE_LIV", "24R"),
        customerReference: envDefault("MONDIAL_RELAY_CUSTOMER_REFERENCE", "MERCHANT").toUpperCase(),
        sender: {
            name: envDefault("MONDIAL_RELAY_SENDER_NAME", ""),
            firstName: envDefault("MONDIAL_RELAY_SENDER_FIRSTNAME", ""),
            lastName: envDefault("MONDIAL_RELAY_SENDER_LASTNAME", ""),
            addressLine1: envDefault("MONDIAL_RELAY_SENDER_ADDRESS1", ""),
            addressLine2: envDefault("MONDIAL_RELAY_SENDER_ADDRESS2", ""),
            addressLine3: envDefault("MONDIAL_RELAY_SENDER_ADDRESS3", ""),
            city: envDefault("MONDIAL_RELAY_SENDER_CITY", ""),
            postalCode: envDefault("MONDIAL_RELAY_SENDER_POSTAL_CODE", ""),
            country: envDefault("MONDIAL_RELAY_SENDER_COUNTRY", "FR"),
            phone: senderPhone,
            mobile: envDefault("MONDIAL_RELAY_SENDER_MOBILE", senderPhone),
            email: envDefault("MONDIAL_RELAY_SENDER_EMAIL", ""),
        },
        defaultWeightGrams: integerSetting("MONDIAL_RELAY_DEFAULT_WEIGHT_GRAMS", 500),
        defaultPackageCount: integerSetting("MONDIAL_RELAY_DEFAULT_PACKAGE_COUNT", 1),
        defaultLengthCm: integerSetting("MONDIAL_RELAY_DEFAULT_LENGTH_CM", 30),
        defaultWidthCm: integerSetting("MONDIAL_RELAY_DEFAULT_WIDTH_CM", 20),
        defaultHeightCm: integerSetting("MONDIAL_RELAY_DEFAULT_HEIGHT_CM", 10),
        defaultContent: envDefault("MONDIAL_RELAY_DEFAULT_CONTENT", "Products"),
        defaultShippingAmount: 450,
        declaredCurrency: envDefault("MONDIAL_RELAY_DECLARED_CURRENCY", "EUR"),
        connectCulture: envDefault("MONDIAL_RELAY_CONNECT_CULTURE", "fr-FR"),
        connectVersionApi: envDefault("MONDIAL_RELAY_CONNECT_VERSION_API", "1.0"),
        connectOutputFormat: envDefault("MONDIAL_RELAY_CONNECT_OUTPUT_FORMAT", "10x15"),
        connectOutputType: envDefault("MONDIAL_RELAY_CONNECT_OUTPUT_TYPE", "PdfUrl"),
    };
}

function integerSetting(name: string, fallback: number): number {
    const text = envDefault(name, "");
    if (!text) {
        return fallback;
    }
    const value = Number(text);
    return Number.isInteger(value) && value > 0 ? value : fallback;
}
