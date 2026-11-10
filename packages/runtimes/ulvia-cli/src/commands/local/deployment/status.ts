import { describeLocalServices } from "../../../runtime/stack/orchestration/services";
import { loadInstallationConfig } from "../../../runtime/stack/installation";
import { sameConfiguration } from "../../../runtime/stack/orchestration/deployment/apply";
import { controlAccessible } from "../../../runtime/stack/orchestration/shared/readiness";
import { sharedEdgeNames } from "../../../runtime/stack/orchestration/shared/files";
import type { ComposeServiceState } from "../../../runtime/stack/orchestration/compose";
import type { UlviaPaths } from "../../../runtime/paths";

export async function showInstallationStatus(paths: UlviaPaths, log: (line: string) => void): Promise<void> {
    const { state, services } = await describeLocalServices(paths);
    const applied = state?.applied;
    const target = state?.operation?.target ?? applied;
    const desired = await loadInstallationConfig(paths);
    const expected = target
        ? ["mongo", "provider", "proxy", ...sharedEdgeNames(target.installation.hosting.edgeCount)]
        : [];
    const healthy =
        expected.length > 0 &&
        expected.every((name) =>
            services.some(
                (row) => row.service === name && row.state === "running" && (!row.health || row.health === "healthy"),
            ),
        );
    log(`Installation: ${!target ? "not applied" : healthy ? "running" : aggregateStatus(services)}`);
    log(`Stack release: ${applied?.release.version ?? "not applied"}`);
    log(
        `Configuration: ${applied && desired && sameConfiguration(desired, applied.installation) ? "applied" : "changes pending"}`,
    );
    if (state?.operation) {
        log(
            `Deployment: ${state.operation.kind} ${state.operation.target.release.version} (${state.operation.phase}); resume with ulvia ${state.operation.kind}`,
        );
    }
    const runningEdges = services.filter((row) => /^edge-[0-9]+$/u.test(row.service) && row.state === "running").length;
    log(
        `Shared Edges: ${runningEdges} running → ${desired?.hosting.edgeCount ?? target?.installation.hosting.edgeCount ?? 0} configured`,
    );
    if (target) {
        log(`Control: ${target.installation.hosting.controlOrigin}`);
        const protocol = target.installation.tls.mode === "acme" ? "HTTPS" : "HTTP";
        log(`Control ${protocol}: ${(await controlAccessible(target)) ? "ready" : "pending"}`);
    }
    for (const name of expected) {
        const row = services.find((service) => service.service === name);
        log(`${name}: ${row ? [row.state, row.health, row.image].filter(Boolean).join(" / ") : "missing"}`);
    }
    log(`Persistent data: ${paths.data}`);
}
export function aggregateStatus(services: readonly ComposeServiceState[]): "stopped" | "degraded" {
    return services.some(({ state }) => state === "running") ? "degraded" : "stopped";
}
