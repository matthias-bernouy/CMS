import type { VerificationPullLoopDiagnostic } from "./pullLoop";

export type VerificationRuntimeHealthSnapshot = Readonly<{
    ready: boolean;
    state: "starting" | "ready" | "degraded";
    consecutiveFailures: number;
    lastSuccessAt?: string;
    lastFailure?: Readonly<VerificationPullLoopDiagnostic & { occurredAt: string }>;
}>;

export class VerificationRuntimeHealth {
    private value: VerificationRuntimeHealthSnapshot = Object.freeze({
        ready: false,
        state: "starting",
        consecutiveFailures: 0,
    });

    constructor(private readonly now: () => string = () => new Date().toISOString()) {}

    success(): void {
        this.value = Object.freeze({
            ready: true,
            state: "ready",
            consecutiveFailures: 0,
            lastSuccessAt: this.now(),
        });
    }

    failure(diagnostic: VerificationPullLoopDiagnostic): void {
        this.value = Object.freeze({
            ready: false,
            state: "degraded",
            consecutiveFailures: this.value.consecutiveFailures + 1,
            ...(this.value.lastSuccessAt ? { lastSuccessAt: this.value.lastSuccessAt } : {}),
            lastFailure: Object.freeze({ ...diagnostic, occurredAt: this.now() }),
        });
    }

    snapshot(): VerificationRuntimeHealthSnapshot {
        return this.value;
    }
}

export function startVerifierHealthServer(
    port: number,
    health: VerificationRuntimeHealth = new VerificationRuntimeHealth(),
): Bun.Server<unknown> {
    return Bun.serve({
        port,
        hostname: "0.0.0.0",
        fetch(request) {
            if (request.method !== "GET") {
                return new Response(null, { status: 404 });
            }
            const path = new URL(request.url).pathname;
            if (path === "/live") {
                return Response.json({ live: true });
            }
            if (path === "/ready") {
                const snapshot = health.snapshot();
                return Response.json(snapshot, { status: snapshot.ready ? 200 : 503 });
            }
            return new Response(null, { status: 404 });
        },
    });
}
