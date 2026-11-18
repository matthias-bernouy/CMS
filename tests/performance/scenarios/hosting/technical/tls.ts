import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { observeNative } from "../../../harness/clients/http";
import { assertCondition, requireRecord } from "../../queries/types";
import { peekHosting } from "../pages";
import type { CapabilityInventory, Variant } from "../../../capabilities/types";
import type { HostingContext } from "../context";
import type { PreparedSample } from "../../../harness/execution/samples";

/** All positive samples require real ownership proof, controlled A/AAAA resolution and a trusted Caddy certificate. */
export async function prepareTlsPermission(
    inventory: CapabilityInventory,
    context: HostingContext,
    variant: Variant,
): Promise<PreparedSample> {
    const stack = context.environment.stack;
    assertCondition(stack.dns && stack.tls && stack.providerControl);
    const dns = stack.dns;
    const address = stack.tls.address;
    const target = inventory.targets.find((row) => !row.retained && row.release.contractId === "ulvia/provider.tls");
    assertCondition(target && target.definition.id === "certificates.permit");
    const origin = await stack.providerControl.origin();
    const anchor = await context.anchor();
    const hostname = `tls-${crypto.randomUUID()}.performance.test`;
    const claim = await context.checked("domains.claim", {
        instanceId: anchor.instance.id,
        origin: `https://${hostname}`,
    });
    const domain = requireRecord(claim.domain);
    const proof = requireRecord(claim.proof);
    const call = (name = hostname) =>
        observeNative({
            origin,
            target,
            binding: "http",
            input: { domain: name },
            credentials: {},
            assert(value) {
                assertCondition(requireRecord(value).permission === "allowed", "tls-permission-dto");
            },
        });
    const read = () => peekHosting(context, "domains", hostname, anchor.instance.id);
    const counts = async () => {
        const values = await Promise.all([dns.counts(hostname, "A"), dns.counts(hostname, "AAAA")]);
        const total = values.reduce(
            (sum, value) => ({
                requests: sum.requests + value.requests,
                requestBytes: sum.requestBytes + value.requestBytes,
                responseBytes: sum.responseBytes + value.responseBytes,
            }),
            { requests: 0, requestBytes: 0, responseBytes: 0 },
        );
        return { ...total, ipv4: values[0]!.requests, ipv6: values[1]!.requests };
    };
    const close = async () => {
        try {
            const current = await read();
            if (current.state !== "disabled") {
                await context.checked("domains.disable", { hostname, expectedRevision: current.revision });
            }
        } finally {
            await Promise.all([
                dns.remove(hostname, "A"),
                dns.remove(hostname, "AAAA"),
                dns.remove(String(proof.name)),
            ]);
        }
    };
    try {
        const pending = await call();
        assertCondition(!pending.validated && pending.status === 403, "tls-pending-domain-authority");
        await dns.put(String(proof.name), String(proof.value));
        await dns.put(hostname, address, "A");
        await context.checked("domains.verify", { hostname, expectedRevision: domain.revision });
        const deadline = Date.now() + 60_000;
        for (;;) {
            const current = await read();
            if (current.state === "active" && current.tls === "ready") {
                break;
            }
            assertCondition(Date.now() < deadline, "tls-real-certificate-not-ready");
            await Bun.sleep(1000);
        }
        if (variant === "invalidation") {
            await dns.put(hostname, "192.0.2.254", "A");
            const refused = await call();
            assertCondition(!refused.validated && refused.status === 403, "tls-wrong-dns-authority");
            await dns.put(hostname, address, "A");
        }
        return {
            async send() {
                const before = await counts();
                const observation = await call();
                try {
                    const after = await counts();
                    const requests = after.requests - before.requests;
                    return {
                        ...observation,
                        dependencies: [
                            {
                                service: "dns" as const,
                                requests,
                                requestBytes: after.requestBytes - before.requestBytes,
                                responseBytes: after.responseBytes - before.responseBytes,
                                // The window can include overlapping background reconciliation, never fewer families.
                                complete: after.ipv4 > before.ipv4 && after.ipv6 > before.ipv6,
                            },
                        ],
                    };
                } catch {
                    return { ...observation, validated: false, failure: "dependency-evidence-incomplete" };
                }
            },
            async verify() {
                const current = await read();
                assertCondition(
                    current.instanceId === anchor.instance.id && ["verified", "active"].includes(String(current.state)),
                );
                const absent = await call(`missing-${crypto.randomUUID()}.performance.test`);
                assertCondition(!absent.validated && absent.status === 403);
                const invalid = await call("invalid hostname");
                assertCondition(!invalid.validated && invalid.status === 422);
                await dns.put(hostname, "192.0.2.254", "A");
                const changed = await call();
                assertCondition(!changed.validated && changed.status === 403, "tls-stale-positive-authority");
                await dns.put(hostname, address, "A");
                assertCondition((await call()).validated, "tls-restored-dns-authority");
                // Background TLS reconciliation may independently advance the domain revision.
                const restored = await read();
                assertCondition(
                    restored.instanceId === anchor.instance.id && restored.origin === `https://${hostname}`,
                );
                const disabled = await context.checked("domains.disable", {
                    hostname,
                    expectedRevision: restored.revision,
                });
                const revoked = await call();
                assertCondition(!revoked.validated && revoked.status === 403, "tls-disabled-domain-authority");
                assertCondition(canonicalizeIJson(await read()) === canonicalizeIJson(disabled));
            },
            close,
        };
    } catch (error) {
        await close();
        throw error;
    }
}
