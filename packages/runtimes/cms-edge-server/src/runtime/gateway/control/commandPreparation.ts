import { GatewayCommandNotStarted, GatewayError } from "@bernouy/cms-gateway";
import { ControlProviderError } from "./errors";

/** Stage evidence is meaningful only on the authenticated, negotiated control connection. */
export function decodeCommandPreparation(packet: Record<string, unknown>, requestId: string): Record<string, unknown> {
    if (packet.failure !== null) {
        const failure = packet.failure as { stage?: unknown; status?: unknown } | null;
        if (
            packet.prepared !== null ||
            !failure ||
            !["identity", "audit", "preparation"].includes(String(failure.stage)) ||
            ![403, 404, 409, 422, 429, 503].includes(Number(failure.status))
        ) {
            throw new TypeError("Invalid command preparation failure");
        }
        const cause =
            failure.stage === "audit"
                ? new GatewayError(
                      "transport_failure",
                      "provider command audit is unavailable; command was not dispatched",
                      requestId,
                  )
                : new ControlProviderError(
                      failure.stage === "identity" ? "gateway.identity.resolve" : "gateway.dispatch.prepare",
                      Number(failure.status),
                  );
        throw failure.stage === "preparation" ? cause : new GatewayCommandNotStarted(cause);
    }
    if (!packet.prepared || typeof packet.prepared !== "object" || Array.isArray(packet.prepared)) {
        throw new TypeError("Invalid command preparation result");
    }
    return packet.prepared as Record<string, unknown>;
}

/** Preparation-stage failures use the successful closed envelope; outer 4xx refusals precede execution. */
export function rejectUnstartedCommand(error: unknown): never {
    if (error instanceof ControlProviderError && error.status >= 400 && error.status < 500) {
        throw new GatewayCommandNotStarted(error);
    }
    throw error;
}
