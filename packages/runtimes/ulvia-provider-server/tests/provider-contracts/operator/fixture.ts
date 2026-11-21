import { BunRunner } from "@bernouy/http-runner";
import { NOOP_LOGGER } from "@bernouy/logging";
import { mountOperatorCapabilities, UlviaProvider } from "@bernouy/ulvia-provider";
import { ClusterLogs } from "@bernouy/observability/cluster";
import { createClusterLogsRuntime } from "../../../src/runtime/gateway/operator/runtime";
import { SystemBootstrap } from "../../../src/runtime/instances/system/execution/SystemBootstrap";
import { bundledBootstrapSources } from "../../../src/runtime/instances/system/bootstrap";

export const operatorToken = "operator-only-private-token-at-least-32-characters";
export const input = { instanceIds: ["instance:tenant-a"] };
export async function fixture(hold?: () => Promise<void>) {
    let reads = 0;
    const logs = new ClusterLogs({
        directory: {
            open: async () => {
                reads++;
                return {
                    query: async () => {
                        await hold?.();
                        return [];
                    },
                    get: async () => null,
                    aggregate: async () => ({ total: 0, groups: [] }),
                    latency: async () => [],
                };
            },
        },
        cursorKey: operatorToken,
        scopeId: "provider-host",
    });
    const system = new SystemBootstrap(bundledBootstrapSources());
    const runtime = await createClusterLogsRuntime(system, logs);
    const runner = new BunRunner();
    const authenticateReport = mountOperatorCapabilities(runner, runtime, operatorToken);
    new UlviaProvider(runner, {
        logger: NOOP_LOGGER,
        authenticateReportToken: async (token) => authenticateReport(token),
        authenticateControlToken: async () => null,
        authenticateInvocationToken: async () => null,
    });
    const call = (token: string | null, body: unknown = input, extra: Record<string, string> = {}) =>
        runner.handle(
            new Request("http://provider.local/ulvia/operator/logs/query", {
                method: "QUERY",
                headers: {
                    "content-type": "application/json",
                    ...(token ? { authorization: `Bearer ${token}` } : {}),
                    ...extra,
                },
                body: JSON.stringify(body),
            }),
        );
    const report = (token: string) =>
        runner.handle(
            new Request("http://provider.local/ulvia/report", {
                headers: { authorization: `Bearer ${token}` },
            }),
        );
    return { call, report, runtime, system, reads: () => reads };
}
