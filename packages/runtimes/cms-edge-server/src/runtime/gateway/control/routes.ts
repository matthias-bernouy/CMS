import { GatewayRouteCodec } from "@bernouy/cms-gateway/protocol";
import type { GatewayRouteSource, GatewayRoutePacket, GatewayContractPacket } from "@bernouy/cms-gateway/protocol";
import type { AdmittedContractRelease } from "@bernouy/ulvia-contracts";
import { satisfiesVersionRange } from "@bernouy/ulvia-contracts/compatibility";
import type { InstallationsControlContract } from "./index";

type Invoke = (
    id: string,
    method: "POST" | "QUERY",
    path: string,
    input: unknown,
    missing?: boolean,
) => Promise<Record<string, unknown> | null>;

/** One negotiated control connection owns immutable definitions, never mutable authority or credentials. */
export class ControlRouteClient {
    private readonly codec = new GatewayRouteCodec();
    readonly supported: boolean;
    constructor(
        private readonly invoke: Invoke,
        contract: InstallationsControlContract,
    ) {
        this.supported = satisfiesVersionRange(contract.version, ">=1.5.0 <2.0.0");
    }
    async route(contractId: string): Promise<GatewayRouteSource | null> {
        const lease = this.codec.definitions.lease();
        try {
            const packet = await this.invoke(
                "gateway.route.snapshot",
                "QUERY",
                "/gateway/route-snapshot",
                { contractId, known: lease.known },
                true,
            );
            return packet === null ? null : await this.codec.route(packet as unknown as GatewayRoutePacket, lease);
        } finally {
            lease.release();
        }
    }
    async tool(contractIds: readonly string[], name: string): Promise<AdmittedContractRelease | null> {
        const lease = this.codec.definitions.lease();
        try {
            // Existing tool identities are at most sixty UTF-16 code units. Keep global validation for unknown names.
            const toolName = name.length > 60 ? "" : name;
            const packet = await this.invoke("gateway.mcp.resolve", "QUERY", "/gateway/mcp/resolve", {
                contractIds,
                toolName,
                known: lease.known,
            });
            if (!packet) {
                throw new TypeError("Installations Provider returned an empty tool lookup");
            }
            return await this.codec.contract(packet as unknown as GatewayContractPacket, lease);
        } finally {
            lease.release();
        }
    }
}
