export type GatewayErrorCode =
    | "not_selected"
    | "invalid_route"
    | "installation_unavailable"
    | "not_ready"
    | "not_authorized"
    | "rate_limited"
    | "invalid_input"
    | "invalid_provider_response"
    | "unsupported_behavior"
    | "stale_route"
    | "outcome_unknown"
    | "transport_failure"
    | "media_busy"
    | "media_unavailable";

export class GatewayError extends Error {
    constructor(
        readonly code: GatewayErrorCode,
        message: string,
        readonly requestId?: string,
    ) {
        super(message);
        this.name = "GatewayError";
    }
}

/** A trusted transport authorizer rejected the call before any destination dispatch. */
export class GatewayDispatchRejected extends GatewayError {
    constructor(code: "not_authorized" | "rate_limited") {
        super(code, "Gateway rejected the call before dispatch");
        this.name = "GatewayDispatchRejected";
    }
}
