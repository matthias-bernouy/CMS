import { createHash } from "node:crypto";
import { canonicalizeIJson } from "@bernouy/cms-repository/contracts/protocol";
import { snapshotRequestContext } from "@bernouy/cms-gateway/protocol";
import type { ProviderCapabilityInvocationContext } from "../dispatch/registry";
import type { ProviderOperationContext } from "./types";

export function snapshotOperationContext(context: ProviderCapabilityInvocationContext): ProviderOperationContext {
    const { http: _http, signal: _signal, binaryBody, ...durable } = context;
    if (binaryBody) {
        throw new TypeError("Durable operations cannot persist a live binary stream");
    }
    const requestContext = context.http
        ? {
              headers: Object.fromEntries(context.http.headers),
              ...(context.http.resource ? { resource: context.http.resource } : {}),
          }
        : context.requestContext;
    const result = {
        ...durable,
        ...(requestContext ? { requestContext: snapshotRequestContext(requestContext) } : {}),
    };
    return JSON.parse(canonicalizeIJson(result)) as ProviderOperationContext;
}
export function operationDigest(
    input: Readonly<Record<string, unknown>>,
    context: ProviderCapabilityInvocationContext,
): string {
    const headers = context.http ? Object.fromEntries(context.http.headers) : (context.requestContext?.headers ?? {});
    // Presentation and cache preferences do not change a command. Preconditions and custom headers do.
    const executionHeaders = Object.fromEntries(
        Object.entries(headers).filter(
            ([name]) => !["accept", "accept-language", "cache-control", "pragma"].includes(name),
        ),
    );
    const value = { input, headers: executionHeaders };
    return `sha256:${createHash("sha256").update("ulvia-operation-input/v2\0").update(canonicalizeIJson(value)).digest("hex")}`;
}
