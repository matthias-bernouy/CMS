import type { GatewayCommandAuditEvent, GatewayCommandAuditStore } from "cms-gateway/audit/interfaces/GatewayAudit";

export class InMemoryGatewayCommandAuditStore implements GatewayCommandAuditStore {
    readonly #events: GatewayCommandAuditEvent[] = [];

    async append(event: GatewayCommandAuditEvent): Promise<void> {
        this.#events.push(Object.freeze(structuredClone(event)));
    }

    list(): readonly GatewayCommandAuditEvent[] {
        return Object.freeze(structuredClone(this.#events));
    }
}
