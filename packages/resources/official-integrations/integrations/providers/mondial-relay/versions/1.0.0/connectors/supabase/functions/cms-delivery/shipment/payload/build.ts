import { isRecord } from "../../http.ts";
import type { DeliverySettings, JsonRecord, ShipmentPayload } from "../types.ts";
import { addressFrom } from "./addresses.ts";
import { fallbackSettings } from "./settings.ts";
import {
    currencyText,
    integerValue,
    minorAmount,
    minorAmountText,
    nested,
    relayLocation,
    stringValue,
} from "./values.ts";
import { validateShipmentPayload } from "./validation.ts";

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
    const weightGrams = integerValue(
        body.weightGrams ?? nested(body, "package", "weightGrams") ?? defaults.defaultWeightGrams,
        "weightGrams",
    );
    const packageCount = integerValue(
        body.packageCount ?? nested(body, "package", "quantity") ?? defaults.defaultPackageCount,
        "packageCount",
    );
    const deliveryRelayLocation = relayLocation(body);
    const deliveryRelayCountry = deliveryRelayLocation.slice(0, 2).toUpperCase();

    const payload: ShipmentPayload = {
        id: crypto.randomUUID(),
        externalOrderId: stringValue(body.externalOrderId ?? body.external_order_id),
        customerId: stringValue(body.customerId ?? body.customer_id),
        modeCollection: (
            stringValue(body.modeCollection ?? body.mode_collection) || defaults.modeCollection
        ).toUpperCase(),
        modeDelivery: (stringValue(body.modeDelivery ?? body.mode_delivery) || defaults.modeDelivery).toUpperCase(),
        sender,
        recipient,
        deliveryRelayLocation,
        deliveryRelayCountry,
        weightGrams,
        packageCount,
        lengthCm: integerValue(
            body.lengthCm ?? nested(body, "package", "lengthCm") ?? defaults.defaultLengthCm,
            "lengthCm",
        ),
        widthCm: integerValue(body.widthCm ?? nested(body, "package", "widthCm") ?? defaults.defaultWidthCm, "widthCm"),
        heightCm: integerValue(
            body.heightCm ?? nested(body, "package", "heightCm") ?? defaults.defaultHeightCm,
            "heightCm",
        ),
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
