import type { UiFinding } from "../contracts/types";
import type { NetworkTarget } from "./clients";

/** Exact runtime boundaries; directories and generic helpers are never exempted. */
const INFRASTRUCTURE: Readonly<Record<string, string>> = {
    "packages/features/cms-content/src/browser/binding/runtime/query/queryFetch.ts":
        "The declarative query transport executes capability reads.",
    "packages/features/cms-content/src/browser/binding/form/submitRequest.ts":
        "The declarative mutation transport submits serialized native forms.",
};

export function networkPolicy(
    path: string,
    target: NetworkTarget,
): Pick<UiFinding, "rule" | "severity" | "message" | "recommendation"> {
    if (target.kind === "binding") {
        return {
            rule: "ui.network.http",
            severity: "INFO",
            message: `${target.name} submits through the declarative Binding runtime.`,
            recommendation:
                "Keep the form contract declarative and reserve programmatic submission for browser behavior that cannot be expressed by a native form trigger.",
        };
    }
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
            : "For UI data loading or form submission, consider declarative cms-query or cms-mutation bindings. Otherwise document the concrete lifecycle or transport requirement.",
    };
}
