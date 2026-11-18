import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { parseProviderRuntimeReportJson } from "@bernouy/ulvia-providers/installations";
import { observeSignedProvider } from "../../../harness/clients/signed";
import { responseBytes } from "../../../harness/transport/http";
import { assertCondition, requireRecord } from "../../queries/types";
import { peekHosting } from "../pages";
import type { CapabilityInventory, Variant } from "../../../capabilities/types";
import type { PreparedSample } from "../../../harness/execution/samples";
import type { HostingContext } from "../context";

export async function prepareDomainRouting(
    inventory: CapabilityInventory,
    context: HostingContext,
    variant: Variant,
): Promise<PreparedSample> {
    const machine = context.environment.stack.routingControl;
    assertCondition(machine);
    const origin = await machine.origin();
    const target = inventory.targets.find(
        (row) =>
            !row.retained &&
            row.release.contractId === "ulvia/provider.routing" &&
            row.definition.id === "domains.resolve",
    );
    assertCondition(target);
    const anchor = await context.anchor();
    const url = new URL(String(anchor.input.origin));
    url.hostname = `routing-${crypto.randomUUID()}.localhost`;
    const created = await context.checked("domains.claim", { instanceId: anchor.instance.id, origin: url.origin });
    const domain = requireRecord(created.domain);
    assertCondition(domain.state === "active" && domain.instanceId === anchor.instance.id);
    const input = { hostname: url.hostname };
    const call = async (
        body: Readonly<Record<string, unknown>>,
        assert: (value: unknown) => void = () => {},
        secret = machine.secret,
    ) => {
        let output: unknown;
        const observation = await observeSignedProvider(
            {
                origin,
                target,
                binding: "http",
                input: body,
                credentials: {},
                assert(value) {
                    output = value;
                    assert(value);
                },
            },
            { kind: "routing", secret },
        );
        return { observation, output };
    };
    const leaseReport = async (lease: string, allowed: boolean) => {
        const response = await fetch(new URL("/ulvia/report", origin), {
            headers: { authorization: `Bearer ${lease}` },
            redirect: "manual",
            signal: AbortSignal.timeout(30_000),
        });
        const bytes = await responseBytes(response);
        assertCondition(response.status === (allowed ? 200 : 401), "routing-control-lease-authority");
        if (allowed) {
            const report = parseProviderRuntimeReportJson(bytes);
            assertCondition(
                report.instanceId === anchor.instance.id && report.instanceId !== context.environment.stack.instanceId,
                "routing-control-lease-instance-isolation",
            );
        }
    };
    let primed: Readonly<Record<string, unknown>> | undefined;
    try {
        if (variant === "invalidation") {
            const first = await call(input);
            assertCondition(first.observation.validated);
            primed = requireRecord(first.output);
            await leaseReport(String(primed.controlLease), true);
            await context.checked("domains.disable", { hostname: url.hostname, expectedRevision: domain.revision });
        }
        const expected = await peekHosting(context, "domains", url.hostname, anchor.instance.id);
        const before = canonicalizeIJson(expected);
        return {
            async send() {
                let lease: string | undefined;
                const startedAt = Date.now();
                const result = await call(input, (value) => {
                    if (variant === "invalidation") {
                        assertCondition(value === null, "routing-disabled-domain-stale-result");
                        return;
                    }
                    const row = requireRecord(value);
                    assertCondition(
                        row.hostname === url.hostname &&
                            row.origin === url.origin &&
                            row.canonicalOrigin === anchor.instance.origin,
                        "routing-domain-origins",
                    );
                    assertCondition(
                        row.instanceId === anchor.instance.id &&
                            row.domainRevision === domain.revision &&
                            row.instanceRevision === anchor.instance.revision,
                        "routing-instance-revisions",
                    );
                    assertCondition(
                        typeof row.resourceRevision === "string" && /^[0-9a-f-]{36}$/u.test(row.resourceRevision),
                    );
                    assertCondition(
                        typeof row.controlLease === "string" &&
                            row.controlLease.length >= 24 &&
                            row.controlLease.length <= 512,
                    );
                    assertCondition(Number(row.expiresAt) > Date.now() && Number(row.expiresAt) <= startedAt + 61_000);
                    lease = row.controlLease;
                });
                if (!result.observation.validated) {
                    return result.observation;
                }
                try {
                    if (primed) {
                        assertCondition(
                            Date.now() < Number(primed.expiresAt),
                            "routing-invalidation-expired-before-fence-check",
                        );
                        await leaseReport(String(primed.controlLease), false);
                    } else {
                        await leaseReport(lease!, true);
                    }
                    return result.observation;
                } catch {
                    return { ...result.observation, validated: false, failure: "routing-lease-postcondition-failed" };
                }
            },
            async verify() {
                const unknown = await call({ hostname: `missing-${crypto.randomUUID()}.localhost` }, (value) =>
                    assertCondition(value === null),
                );
                assertCondition(unknown.observation.validated);
                const invalid = await call({ hostname: "invalid hostname" });
                assertCondition(!invalid.observation.validated && invalid.observation.status === 422);
                const refused = await call(input, undefined, context.environment.stack.providerControl!.token);
                assertCondition(!refused.observation.validated && refused.observation.status === 401);
                assertCondition(
                    canonicalizeIJson(await peekHosting(context, "domains", url.hostname, anchor.instance.id)) ===
                        before,
                    "routing-refusal-mutated-domain",
                );
            },
            async close() {
                const current = await peekHosting(context, "domains", url.hostname, anchor.instance.id);
                if (current.state !== "disabled") {
                    await context.checked("domains.disable", {
                        hostname: url.hostname,
                        expectedRevision: current.revision,
                    });
                }
            },
        };
    } catch (error) {
        const current = await peekHosting(context, "domains", url.hostname, anchor.instance.id);
        if (current.state !== "disabled") {
            await context.checked("domains.disable", { hostname: url.hostname, expectedRevision: current.revision });
        }
        throw error;
    }
}
