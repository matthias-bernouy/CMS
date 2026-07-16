import { envDefault } from "./env.ts";
import { HttpError, isRecord } from "./http.ts";
import type { Address, DeliverySettings, JsonRecord, ShipmentPayload } from "./types.ts";

export function shipmentPayload(body: JsonRecord, settings: DeliverySettings | null = null): ShipmentPayload {
    const defaults = settings ?? fallbackSettings();
    const sender = addressFrom(body, "sender", defaults.sender);
    const recipient = addressFrom(body, "recipient", {
        name: "",
        firstName: "",
        lastName: "",
        addressLine1: "",
        addressLine2: "",
        addressLine3: "",
        city: "",
        postalCode: "",
        country: "FR",
        phone: "",
        mobile: "",
        email: "",
    });
    const weightGrams = integerValue(body.weightGrams ?? nested(body, "package", "weightGrams") ?? defaults.defaultWeightGrams, "weightGrams");
    const packageCount = integerValue(body.packageCount ?? nested(body, "package", "quantity") ?? defaults.defaultPackageCount, "packageCount");
    const deliveryRelayLocation = relayLocation(body);
    const deliveryRelayCountry = deliveryRelayLocation.slice(0, 2).toUpperCase();

    const payload: ShipmentPayload = {
        id: crypto.randomUUID(),
        externalOrderId: stringValue(body.externalOrderId ?? body.external_order_id),
        customerId: stringValue(body.customerId ?? body.customer_id),
        modeCollection: (stringValue(body.modeCollection ?? body.mode_collection) || defaults.modeCollection).toUpperCase(),
        modeDelivery: (stringValue(body.modeDelivery ?? body.mode_delivery) || defaults.modeDelivery).toUpperCase(),
        sender,
        recipient,
        deliveryRelayLocation,
        deliveryRelayCountry,
        weightGrams,
        packageCount,
        lengthCm: integerValue(body.lengthCm ?? nested(body, "package", "lengthCm") ?? defaults.defaultLengthCm, "lengthCm"),
        widthCm: integerValue(body.widthCm ?? nested(body, "package", "widthCm") ?? defaults.defaultWidthCm, "widthCm"),
        heightCm: integerValue(body.heightCm ?? nested(body, "package", "heightCm") ?? defaults.defaultHeightCm, "heightCm"),
        content: stringValue(body.content ?? nested(body, "package", "content")) || defaults.defaultContent,
        declaredValueMinorAmount: minorAmount(body.declaredValueMinorAmount, "declaredValueMinorAmount"),
        declaredValue: minorAmountText(body.declaredValueMinorAmount, "declaredValueMinorAmount"),
        declaredCurrency: currencyText(body.declaredCurrency, defaults.declaredCurrency),
        connectCulture: defaults.connectCulture,
        connectVersionApi: defaults.connectVersionApi,
        connectOutputFormat: defaults.connectOutputFormat,
        connectOutputType: defaults.connectOutputType,
        instructions: stringValue(body.instructions ?? nested(body, "options", "instructions")),
        metadata: isRecord(body.metadata) ? body.metadata : {},
        raw: body,
    };
    validateShipmentPayload(payload);
    return payload;
}

function addressFrom(body: JsonRecord, prefix: "sender" | "recipient", defaults: Address): Address {
    const source = isRecord(body[prefix]) ? body[prefix] as JsonRecord : {};
    const key = (name: string) => `${prefix}${name.charAt(0).toUpperCase()}${name.slice(1)}`;
    const field = (...aliases: string[]) => {
        for (const alias of aliases) {
            if (Object.prototype.hasOwnProperty.call(source, alias)) return { supplied: true, value: source[alias] };
        }
        for (const alias of aliases) {
            const flatKey = key(alias);
            if (Object.prototype.hasOwnProperty.call(body, flatKey)) return { supplied: true, value: body[flatKey] };
        }
        return { supplied: false, value: undefined };
    };
    const text = (fallback: string, ...aliases: string[]) => {
        const input = field(...aliases);
        return { supplied: input.supplied, value: stringValue(input.supplied ? input.value : fallback) };
    };
    const nameInput = text(defaults.name, "name");
    const firstNameInput = text(defaults.firstName, "firstName", "firstname");
    const lastNameInput = text(defaults.lastName, "lastName", "lastname");
    const name = nameInput.value;
    const firstName = firstNameInput.value;
    const lastName = lastNameInput.value;
    const split = splitName(name);
    const country = text(defaults.country, "country").value.toUpperCase();
    const phone = field("phone", "phoneNo");
    const mobile = field("mobile", "mobileNo");
    return {
        name,
        firstName: firstNameInput.supplied ? firstName : firstName || split.firstName,
        lastName: lastNameInput.supplied ? lastName : lastName || split.lastName,
        addressLine1: text(defaults.addressLine1, "addressLine1", "address1").value,
        addressLine2: text(defaults.addressLine2, "addressLine2", "address2").value,
        addressLine3: text(defaults.addressLine3, "addressLine3", "address3").value,
        city: text(defaults.city, "city").value,
        postalCode: text(defaults.postalCode, "postalCode", "postal_code").value,
        country,
        phone: phoneValue(phone.supplied ? phone.value : defaults.phone, "", country, `${prefix}.phone`),
        mobile: phoneValue(mobile.supplied ? mobile.value : defaults.mobile, "", country, `${prefix}.mobile`),
        email: text(defaults.email, "email").value,
    };
}

function validateShipmentPayload(payload: ShipmentPayload): void {
    if (!payload.externalOrderId) throw new HttpError(400, "externalOrderId is required for protected fulfillment");
    if (payload.modeCollection !== "CCC") throw new HttpError(400, "modeCollection must be CCC for Mondial Relay Connect France");
    if (payload.modeDelivery !== "24R") throw new HttpError(400, "modeDelivery must be 24R for Mondial Relay Connect France");
    requireFrance(payload.sender.country, "sender.country");
    requireFrance(payload.recipient.country, "recipient.country");
    requireFrance(payload.deliveryRelayCountry, "deliveryRelayLocation");
    requireAddress(payload.sender, "sender");
    requireAddress(payload.recipient, "recipient");
    if (payload.weightGrams < 1) throw new HttpError(400, "weightGrams must be positive");
    if (payload.packageCount !== 1) throw new HttpError(400, "packageCount must be 1 for protected single-parcel fulfillment");
    for (const [name, value] of [["lengthCm", payload.lengthCm], ["widthCm", payload.widthCm], ["heightCm", payload.heightCm]] as const) {
        if (value < 1) throw new HttpError(400, `${name} must be positive`);
    }
    validateMoney(payload.declaredValue, payload.declaredCurrency, "declaredValue");
    if (payload.declaredCurrency !== "EUR") throw new HttpError(400, "declaredValue.currency must be EUR");
}

function requireAddress(address: Address, label: string): void {
    for (const field of ["name", "addressLine1", "city", "postalCode", "country"] as const) {
        if (!address[field]) throw new HttpError(400, `${label}.${field} is required`);
    }
    validateFrenchPostalCode(address.postalCode, `${label}.postalCode`);
    validateInternationalPhone(address.phone, `${label}.phone`);
    validateInternationalPhone(address.mobile, `${label}.mobile`);
}

function relayLocation(body: JsonRecord): string {
    const explicit = stringValue(body.deliveryRelayLocation ?? nested(body, "deliveryRelay", "location")).toUpperCase();
    if (/^[A-Z]{2}-[A-Z0-9]{3,10}$/.test(explicit)) return explicit;
    const number = stringValue(body.deliveryRelayNumber ?? nested(body, "deliveryRelay", "number")).toUpperCase();
    const country = (stringValue(body.deliveryRelayCountry ?? nested(body, "deliveryRelay", "country")) || "FR").toUpperCase();
    if (number) return number.includes("-") ? number : `${country}-${number}`;
    throw new HttpError(400, "deliveryRelayLocation is required for 24R pickup point delivery");
}

function requireFrance(value: string, name: string): void {
    if (value !== "FR") throw new HttpError(400, `${name} must be FR for Mondial Relay Connect France`);
}

function validateFrenchPostalCode(value: string, name: string): void {
    if (!/^\d{5}$/.test(value)) throw new HttpError(400, `${name} must be 5 digits for FR`);
}

function validateMoney(value: string, currency: string, name: string): void {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0) throw new HttpError(400, `${name}.value must be a non-negative number`);
    if (amount > 0 && !currency) throw new HttpError(400, `${name}.currency is required when ${name}.value is greater than 0`);
    if (currency && !/^[A-Z]{3}$/.test(currency)) throw new HttpError(400, `${name}.currency must be a 3-letter currency code`);
}

function splitName(name: string): { firstName: string; lastName: string } {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length <= 1) return { firstName: parts[0] || "Customer", lastName: parts[0] || "Customer" };
    return { firstName: parts.slice(0, -1).join(" "), lastName: parts.at(-1) || "" };
}

export function splitStreet(addressLine: string): { houseNo: string; streetName: string } {
    const match = addressLine.trim().match(/^(\d+[A-Za-z]?)\s+(.+)$/);
    if (!match) return { houseNo: "", streetName: addressLine.trim() };
    return { houseNo: match[1] ?? "", streetName: match[2] ?? addressLine.trim() };
}

export function stringValue(value: unknown): string {
    if (typeof value === "string") return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    return "";
}

export function normalizePhone(value: string, country = "FR"): string {
    const raw = value.trim();
    if (!raw) return "";
    let text = raw.replace(/\(0\)/g, "").replace(/[\s.()/\-]/g, "");
    if (text.startsWith("00")) text = `+${text.slice(2)}`;
    if (!text.startsWith("+")) {
        const digits = text.replace(/\D/g, "");
        if (!digits) return "";
        if (country.toUpperCase() === "FR") {
            if (/^0[1-9]\d{8}$/.test(digits)) return `+33${digits.slice(1)}`;
            if (/^33[1-9]\d{8}$/.test(digits)) return `+${digits}`;
        }
        return `+${digits}`;
    }

    text = `+${text.slice(1).replace(/\D/g, "")}`;
    if (country.toUpperCase() === "FR" && /^\+330[1-9]\d{8}$/.test(text)) {
        return `+33${text.slice(4)}`;
    }
    return text;
}

function integerValue(value: unknown, name: string): number {
    const text = stringValue(value);
    const number = Number(text);
    if (!Number.isInteger(number)) throw new HttpError(400, `${name} must be an integer`);
    return number;
}

function minorAmount(value: unknown, name: string): number {
    const text = stringValue(value);
    const amount = Number(text);
    if (!Number.isSafeInteger(amount) || amount < 0 || amount > 999_999_999) {
        throw new HttpError(400, `${name} must be an integer between 0 and 999999999 minor units`);
    }
    return amount;
}

function minorAmountText(value: unknown, name: string): string {
    const amount = minorAmount(value, name);
    const major = Math.floor(amount / 100);
    const minor = String(amount % 100).padStart(2, "0");
    const text = `${major}.${minor}`;
    if (!/^\d{1,7}\.\d{2}$/.test(text)) throw new HttpError(400, `${name} exceeds the Mondial Relay limit`);
    return text;
}

function currencyText(value: unknown, fallback = "EUR"): string {
    return (stringValue(value) || fallback).toUpperCase();
}

function nested(body: JsonRecord, first: string, second: string): unknown {
    const value = body[first];
    return isRecord(value) ? value[second] : undefined;
}

function validateInternationalPhone(value: string, name: string): void {
    if (value && !/^\+[1-9]\d{7,14}$/.test(value)) {
        throw new HttpError(400, `${name} must use E.164 international format`);
    }
}

function phoneValue(value: unknown, fallback: string, country: string, name: string): string {
    const raw = stringValue(value) || fallback;
    const normalized = normalizePhone(raw, country);
    if (raw && !normalized) throw new HttpError(400, `${name} must use E.164 international format`);
    return normalized;
}

function fallbackSettings(): DeliverySettings {
    const senderPhone = envDefault("MONDIAL_RELAY_SENDER_PHONE", "");
    return {
        id: "default",
        modeCollection: envDefault("MONDIAL_RELAY_DEFAULT_MODE_COL", "CCC"),
        modeDelivery: envDefault("MONDIAL_RELAY_DEFAULT_MODE_LIV", "24R"),
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
    if (!text) return fallback;
    const value = Number(text);
    return Number.isInteger(value) && value > 0 ? value : fallback;
}
