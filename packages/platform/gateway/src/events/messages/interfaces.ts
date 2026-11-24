/** Historical provenance data. This reference never grants invocation authority. */
export interface EventInitiator {
    readonly kind: "user" | "system" | "anonymous";
    readonly reference: string;
}
export interface EventMessage {
    readonly format: "ulvia-event/v1";
    readonly occurrenceId: string;
    readonly deliveryId: string;
    readonly subscriptionId: string;
    readonly subscriptionRevision: number;
    readonly consumerContractId: string;
    readonly occurredAt: string;
    readonly initiator?: EventInitiator;
    readonly source: {
        readonly contractId: string;
        readonly eventType: string;
        readonly version: string;
        readonly digest: string;
        readonly installationId: string;
        readonly definitionId: string;
    };
    readonly schemas?: readonly {
        readonly path: string;
        readonly resolver: string;
        readonly resourceId: string;
        readonly version: string;
        readonly digest: string;
    }[];
    readonly payloadJson?: string;
    readonly causation?: readonly string[];
}
export type EventMessageContent = Omit<
    EventMessage,
    "deliveryId" | "subscriptionId" | "subscriptionRevision" | "consumerContractId"
>;
export interface EventReceipt {
    readonly deliveryId: string;
    readonly accepted: boolean;
}
