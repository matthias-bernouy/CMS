import { isResourceId } from "@bernouy/resource-identity";
import { isCanonicalSemVer } from "@bernouy/ulvia-contracts/compatibility";
import { parseStrictJson, canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { validateSchemaValue } from "@bernouy/ulvia-contracts/schema";
import type { CapabilityDefinition } from "@bernouy/ulvia-contracts";
import type { EventMessage, EventReceipt } from "./interfaces";
import { eventMessageSchema, eventReceiptSchema } from "./schema";

export function validateEventMessage(value: unknown): EventMessage {
    validateSchemaValue(eventMessageSchema, value);
    const event = value as EventMessage;
    if (
        !isResourceId(event.source.contractId) ||
        !isResourceId(event.consumerContractId) ||
        !isCanonicalSemVer(event.source.version) ||
        !/^sha256:[a-f0-9]{64}$/u.test(event.source.digest) ||
        !/^[a-f0-9]{64}$/u.test(event.source.definitionId) ||
        !/^[a-z][a-z0-9]*(?:[.-][a-z][a-z0-9]*)*$/u.test(event.source.eventType) ||
        event.causation?.some((key) => !/^[a-f0-9]{64}$/u.test(key))
    ) {
        throw new TypeError("Invalid contract event provenance");
    }
    if (
        event.schemas?.some(({ digest }) => !/^sha256:[a-f0-9]{64}$/u.test(digest)) ||
        new Set(event.schemas?.map(({ path }) => path)).size !== (event.schemas?.length ?? 0)
    ) {
        throw new TypeError("Invalid event resource digest");
    }
    if (event.payloadJson !== undefined) {
        parseStrictJson(new TextEncoder().encode(event.payloadJson), 1048576, 32);
    }
    return event;
}
export function validateEventReceipt(value: unknown, deliveryId: string): EventReceipt {
    validateSchemaValue(eventReceiptSchema, value);
    const receipt = value as EventReceipt;
    if (receipt.deliveryId !== deliveryId || receipt.accepted !== true) {
        throw new TypeError("Event receipt does not confirm the requested delivery");
    }
    return receipt;
}
export function assertEventMessageReceiver(capability: CapabilityDefinition): void {
    if (
        capability.behavior.effect !== "command" ||
        capability.behavior.execution !== "sync" ||
        capability.behavior.idempotency !== "natural" ||
        capability.responseEffects?.length ||
        canonicalizeIJson(capability.input) !== canonicalizeIJson(eventMessageSchema) ||
        canonicalizeIJson(capability.output) !== canonicalizeIJson(eventReceiptSchema)
    ) {
        throw new TypeError("Capability does not implement the event message protocol");
    }
}
