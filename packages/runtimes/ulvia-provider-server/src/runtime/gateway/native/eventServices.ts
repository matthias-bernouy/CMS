import { assertEventMessageReceiver } from "@bernouy/cms-gateway/events";
import type { CapabilityDefinition } from "@bernouy/ulvia-contracts";
/** Internal schema services can only invoke admitted standard resolver roles. */
export function eventServiceAuthorized(serviceId: string, capability: CapabilityDefinition) {
    if (serviceId === "cms-events-delivery") {
        try {
            assertEventMessageReceiver(capability);
            return true;
        } catch {
            return false;
        }
    }
    return (
        ["cms-events-schema", "cms-workflows-schema"].includes(serviceId) &&
        capability.behavior.effect === "query" &&
        capability.behavior.execution === "sync" &&
        Boolean(capability.schemaResolver)
    );
}
