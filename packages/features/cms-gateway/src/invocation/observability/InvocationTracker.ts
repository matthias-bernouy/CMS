import type { TraceContext } from "@bernouy/logging";
import type { GatewayInvocation, GatewayResult } from "../interfaces/Invocation";
import type { InvocationObserver, InvocationObservation } from "./interfaces";
import { observeStream } from "./observeStream";

export class InvocationTracker {
    readonly started = performance.now();
    private phaseStarted = this.started;
    private phase = "input";
    private phases: Record<string, number> = {};
    private fields: Partial<InvocationObservation> = {};
    private emitted = false;
    constructor(
        private readonly observer: InvocationObserver | undefined,
        private readonly trace: TraceContext,
        value: GatewayInvocation,
    ) {
        const id = (part: unknown) =>
            typeof part === "string" && /^[A-Za-z0-9._:-]{1,128}$/u.test(part) ? part : undefined;
        this.fields = {
            requestId: trace.spanId,
            contractId: id(value?.contractId),
            capabilityId: id(value?.capabilityId),
            actorKind: ["anonymous", "user", "administrator", "provider", "system"].includes(value?.actor?.kind)
                ? value.actor.kind
                : "unknown",
            ...(value?.actor?.kind === "provider" ? { sourceInstallationId: id(value.actor.installationId) } : {}),
        };
    }
    enter(phase: string) {
        const now = performance.now();
        this.phases[this.phase] = (this.phases[this.phase] ?? 0) + now - this.phaseStarted;
        this.phase = phase;
        this.phaseStarted = now;
    }
    update(fields: Partial<InvocationObservation>) {
        Object.assign(this.fields, fields);
    }
    result(value: GatewayResult, metadataOnly?: boolean): GatewayResult {
        if (value.kind === "binary" && !metadataOnly) {
            this.enter("stream");
            return {
                ...value,
                stream: observeStream(value.stream, (outcome, bytes) =>
                    this.finish(outcome, undefined, value.resource?.status ?? value.status, bytes),
                ),
            };
        }
        this.finish(
            value.kind === "declared-error" ? "declared-error" : "completed",
            value.kind === "declared-error" ? value.errorCode : undefined,
            value.status,
            value.kind === "success" && value.output !== undefined
                ? new TextEncoder().encode(JSON.stringify(value.output)).byteLength
                : 0,
        );
        return value;
    }
    failed(error: unknown) {
        const code =
            error && typeof error === "object" && "code" in error && typeof error.code === "string"
                ? error.code
                : "internal_error";
        this.finish("failed", code);
    }
    private finish(outcome: string, code?: string, status?: number, responseBytes?: number) {
        if (this.emitted) {
            return;
        }
        this.emitted = true;
        const finalPhase = this.phase;
        this.enter(this.phase);
        const event = {
            ...this.fields,
            ...this.trace,
            requestId: this.trace.spanId,
            actorKind: this.fields.actorKind ?? "unknown",
            phase: finalPhase,
            outcome,
            ...(code ? { code } : {}),
            ...(status === undefined ? {} : { status }),
            durationMs: performance.now() - this.started,
            ...(responseBytes === undefined ? {} : { responseBytes }),
            phases: { ...this.phases },
        };
        try {
            void Promise.resolve(this.observer?.(Object.freeze(event))).catch(() => undefined);
        } catch {
            /* Diagnostics cannot fail a business operation. */
        }
    }
}
