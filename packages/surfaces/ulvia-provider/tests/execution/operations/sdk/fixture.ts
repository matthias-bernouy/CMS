import type { CompiledProvider } from "@bernouy/ulvia-sdk";
import {
    MemoryProviderOperationStore,
    ProviderOperationExecutor,
    createProviderOperationAdapter,
} from "@bernouy/ulvia-provider";
import type { ProviderOperationRecord } from "@bernouy/ulvia-provider";
import { createProvider } from "@bernouy/ulvia-sdk/provider";
import type { ProviderOperationRegistration, ProviderOperationAdapter } from "@bernouy/ulvia-sdk/provider";
import { signProviderInvocationToken, verifyProviderInvocationToken } from "@bernouy/cms-gateway/protocol";
import type { ProviderInvocationClaims } from "@bernouy/cms-gateway/protocol";
import { jobBuild, providerId, contractId } from "./feature";
import type { Control, JobServices } from "./feature";

const secret = "durable-sdk-provider-secret-" + "x".repeat(64);
export class HeldOperationStore extends MemoryProviderOperationStore {
    held = true;
    lookups = 0;
    override async createOrGet(record: ProviderOperationRecord) {
        this.lookups++;
        return super.createOrGet(record);
    }
    override claim(...args: Parameters<MemoryProviderOperationStore["claim"]>) {
        return this.held ? Promise.resolve(false) : super.claim(...args);
    }
}
export async function operationFixture(
    options: {
        versions?: readonly string[];
        inherited?: boolean;
        store?: HeldOperationStore;
        control?: Control;
        leaseMs?: number;
    } = {},
) {
    const build: CompiledProvider<JobServices> = await jobBuild(options.versions, options.inherited);
    const control: Control = options.control ?? { allowed: true, fail: false, invalid: false, calls: [] };
    const store = options.store ?? new HeldOperationStore();
    const observations: unknown[] = [];
    const presentations: number[] = [];
    const executor = new ProviderOperationExecutor(store, undefined, {
        contracts: build.implementedContracts,
        leaseMs: options.leaseMs,
        onFailure: (event, error) => observations.push({ event, error }),
    });
    const adapter = createProviderOperationAdapter(executor);
    const registrations: ProviderOperationRegistration[] = [];
    const operations: ProviderOperationAdapter = {
        register(operation) {
            registrations.push(operation);
            adapter.register(operation);
        },
        enqueue: (invocation) => adapter.enqueue(invocation),
    };
    const runtime = createProvider(
        build,
        { control },
        {
            scope: { siteId: "site-a", instanceId: "instance-a" },
            operations,
            executeKeyed: async () => {
                throw new Error("Default operations must not use a second keyed receipt adapter");
            },
            formatCapabilityFailure: (_failure, { invocation, status }) => {
                presentations.push(status);
                const french = invocation.http?.headers.get("accept-language") === "fr";
                return {
                    output: { message: french ? "Refus public." : "Public refusal." },
                    responseHeaders: { "content-language": french ? "fr" : "en" },
                    reason: "job.refused",
                };
            },
            authenticate: async (request) => {
                try {
                    const claims = verifyProviderInvocationToken(
                        (request.headers.get("authorization") ?? "").slice(7),
                        secret,
                    );
                    return { claims, siteId: "site-a", providerId };
                } catch {
                    return null;
                }
            },
            authorize: async (claims) => claims.actorKind === "administrator",
        },
    );
    const call = async (
        options: {
            version?: string;
            contractId?: string;
            key?: string;
            value?: unknown;
            path?: string;
            claims?: Partial<ProviderInvocationClaims>;
            headers?: HeadersInit;
        } = {},
    ) => {
        const claims: ProviderInvocationClaims = {
            version: 1,
            requestId: crypto.randomUUID(),
            instanceId: "instance-a",
            contractId: options.contractId ?? contractId,
            contractVersion: options.version ?? "1.0.0",
            capabilityId: "start",
            actorKind: "administrator",
            subjectId: "administrator-a",
            issuedAt: Math.floor(Date.now() / 1000),
            expiresAt: Math.floor(Date.now() / 1000) + 30,
            ...options.claims,
        };
        const headers = new Headers(options.headers);
        headers.set("content-type", "application/json");
        headers.set("x-ulvia-request-id", claims.requestId);
        headers.set("idempotency-key", options.key ?? "same-key");
        headers.set("authorization", `Bearer ${signProviderInvocationToken(secret, claims)}`);
        return runtime.fetch(
            new Request("https://provider.test" + (options.path ?? "/jobs"), {
                method: "POST",
                headers,
                body: JSON.stringify({ value: options.value ?? "test" }),
            }),
        );
    };
    return { build, runtime, control, store, executor, registrations, operations, observations, presentations, call };
}
