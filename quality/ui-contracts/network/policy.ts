import type { UiFinding } from "../contracts/types";
import type { NetworkTarget } from "./clients";

/** Exact runtime boundaries; directories and generic helpers are never exempted. */
const INFRASTRUCTURE: Readonly<Record<string, string>> = {
    "packages/foundation/components/src/binding/source/fetcher.ts":
        "The declarative cms-source transport executes binding requests.",
    "packages/foundation/components/src/binding/submit/submitRequest.ts":
        "The declarative form transport submits serialized binding state.",
    "packages/surfaces/cms-control/src/components/editorSystemV2/documentMutations.ts":
        "The editor document lifecycle persists authored document changes.",
};

export function networkPolicy(
    path: string,
    target: NetworkTarget,
): Pick<UiFinding, "rule" | "severity" | "message" | "recommendation"> {
    if (target.kind === "websocket" || target.kind === "eventsource") {
        const protocol = target.kind === "websocket" ? "WebSocket" : "EventSource";
        return {
            rule: `ui.network.${target.kind}`,
            severity: "INFO",
            message: `${protocol} establishes a long-lived browser connection.`,
            recommendation:
                "Review the connection's protocol purpose, ownership, teardown and reconnect behavior; ordinary HTTP binding is not a protocol replacement.",
        };
    }
    const purpose = INFRASTRUCTURE[path.replaceAll("\\", "/").replace(/^\.\//, "")];
    return {
        rule: "ui.network.http",
        severity: purpose ? "INFO" : "WARNING",
        message: purpose
            ? `${target.name} belongs to an explicit infrastructure boundary. ${purpose}`
            : `${target.name} performs imperative browser HTTP work.`,
        recommendation: purpose
            ? "Keep request execution inside this explicit runtime boundary; callers should use its supported contract."
            : "For UI data loading or form submission, consider declarative cms-source/form binding. Otherwise document the concrete lifecycle or transport requirement.",
    };
}
