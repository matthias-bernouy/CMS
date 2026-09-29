export type GatewayErrorCode =
    | "not_selected"
    | "invalid_route"
    | "installation_unavailable"
    | "not_ready"
    | "not_authorized"
    | "invalid_input"
    | "invalid_provider_response"
    | "unsupported_behavior"
    | "stale_route"
    | "transport_failure";

export class GatewayError extends Error {
    constructor(
        readonly code: GatewayErrorCode,
        message: string,
    ) {
        super(message);
        this.name = "GatewayError";
    }
}
