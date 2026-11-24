import type { GatewayActor } from "./Invocation";
import type { SchemaDescriptor } from "@bernouy/ulvia-contracts/schema";
export interface GatewaySchemaSeal {
    readonly actor: GatewayActor;
    readonly target: {
        readonly installationId: string;
        readonly contractId: string;
        readonly capabilityId: string;
        readonly version: string;
        readonly digest: string;
        readonly endpoint: string;
        readonly accountId: string;
        readonly instanceId: string;
    };
    readonly descriptor: SchemaDescriptor;
}
export interface GatewaySchemaVersions {
    seal(input: GatewaySchemaSeal): Promise<void>;
}
