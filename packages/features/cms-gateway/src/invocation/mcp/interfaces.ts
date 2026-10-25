import type { AdmittedContractRelease, CapabilityDefinition } from "@bernouy/cms-repository/contracts";
import type {
    GatewayActor,
    GatewayInvocation,
    GatewayInvoker,
    GatewayResult,
} from "cms-gateway/invocation/interfaces/Invocation";

export type McpInvocationContext = Readonly<{ siteId: string; actor: GatewayActor }>;
export type McpResourceLink = Readonly<{
    type: "resource_link";
    uri: string;
    name: string;
    mimeType?: string;
    size?: number;
}>;
export type McpToolResult = Readonly<{
    content: readonly (McpResourceLink | { type: "text"; text: string })[];
    structuredContent?: Record<string, unknown>;
    isError?: boolean;
}>;

export interface CapabilityMcpOptions {
    readonly invoker: Pick<GatewayInvoker, "invoke">;
    readonly onMutationSuccess?: (value: { contractId: string; capabilityId: string }) => void | Promise<void>;
    /** Return exact admitted releases available for this trusted host scope. Maximum 1024 capabilities. */
    readonly contracts: (context: McpInvocationContext) => Promise<readonly AdmittedContractRelease[]>;
    /** Resolve host-owned resource handles. Never fetch an arbitrary client-supplied URL. */
    readonly resolveBinary?: (
        uri: string,
        capability: CapabilityDefinition,
        context: McpInvocationContext,
    ) => Promise<NonNullable<GatewayInvocation["binaryBody"]>>;
    /** Persist or expose an authorized bounded stream and return a client-usable resource link. */
    readonly publishBinary?: (
        result: Extract<GatewayResult, { kind: "binary" }>,
        capability: CapabilityDefinition,
        context: McpInvocationContext,
        input: Readonly<Record<string, unknown>>,
    ) => Promise<McpResourceLink>;
}
