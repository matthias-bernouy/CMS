import { observeNative } from "../../../harness/clients/http";
import { gatewayContext } from "../../gateway/context";
import { machineInvocation } from "../../gateway/machine";
import { assertCondition } from "../../queries/types";
import { assertClusterRead } from "./oracle";
import type { CapabilityInventory, Variant } from "../../../capabilities/types";
import type { QueryEnvironment } from "../../queries/execute";
import type { PreparedSample } from "../../../harness/execution/samples";

export async function prepareClusterRead(
    inventory: CapabilityInventory,
    environment: QueryEnvironment,
    capability: string,
    variant: Variant,
): Promise<PreparedSample> {
    const operator = environment.stack.operatorControl;
    assertCondition(operator && environment.stack.providerControl);
    const origin = await operator.origin();
    const target = inventory.targets.find(
        (row) => !row.retained && row.release.contractId === "ulvia/cluster.logs" && row.definition.id === capability,
    );
    assertCondition(target);
    const context = await gatewayContext(inventory, environment);
    const append = async (entries: readonly Readonly<Record<string, unknown>>[]) => {
        const call = await machineInvocation(context, "ulvia/cms.observability", "logs.append");
        assertCondition((await call({ entries })).observation.validated, "cluster-log-fixture-ingestion-failed");
    };
    const now = Date.now();
    // Pick the middle of a UTC hour, including history variants, so all fixture durations share one bucket.
    const hour = Math.floor((now - (variant === "history" ? 7 * 86400000 : 3600000)) / 3600000) * 3600000;
    const event = `performance.cluster.${crypto.randomUUID().replaceAll("-", "")}`;
    const count = variant === "large" || variant === "history" ? 128 : 16;
    const entries = Array.from({ length: count }, (_, index) => ({
        id: crypto.randomUUID(),
        time: new Date(hour + 1800000 + index).toISOString(),
        level: "info",
        event,
        durationMs: 10 + index,
        contractId: "ulvia/cms.content",
        capabilityId: "pages.get",
        attributes: { password: "never-store-this" },
    }));
    for (let start = 0; start < entries.length; start += 50) {
        await append(entries.slice(start, start + 50));
    }
    const filters = {
        instanceIds: [environment.stack.instanceId],
        from: new Date(hour).toISOString(),
        to: new Date(hour + 3600000).toISOString(),
        event,
        service: "cms-edge",
    };
    const input = () =>
        capability === "logs.get"
            ? { instanceId: environment.stack.instanceId, id: entries.at(-1)!.id }
            : capability === "logs.aggregate"
              ? { ...filters, groupBy: "level" }
              : capability === "latency.query"
                ? { ...filters, groupBy: "capabilityId", intervalSeconds: 3600 }
                : { ...filters, limit: 200 };
    const send = (token = operator.token, check = true) =>
        observeNative({
            origin,
            target,
            binding: "http",
            input: input(),
            credentials: { token },
            assert: (output) => {
                if (check) {
                    assertClusterRead(
                        capability,
                        output,
                        environment.stack.instanceId,
                        entries.map((row) => row.id),
                        entries.map((row) => row.durationMs),
                    );
                }
            },
        });
    if (variant === "invalidation") {
        assertCondition((await send()).validated);
        const fresh = { ...entries[0]!, id: crypto.randomUUID(), durationMs: 200 };
        await append([fresh]);
        entries.push(fresh);
    }
    return {
        send: () => send(),
        async verify() {
            const tenant = await send(environment.stack.providerControl!.token, false);
            assertCondition(!tenant.validated && tenant.status === 401, "cluster-log-tenant-authority-leak");
            assertCondition((await send()).validated, "cluster-log-state-changed-after-refusal");
        },
    };
}
