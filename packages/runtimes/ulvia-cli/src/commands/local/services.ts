import type { UlviaPaths } from "../../runtime/paths";
import { showLocalLogs } from "../../runtime/stack/logs";
import type { InstallationConfig } from "../../runtime/stack/installation";
import type { ComposeServiceState } from "../../runtime/stack/orchestration/compose";
import {
    describeLocalServices,
    startLocalServices,
    stopLocalServices,
} from "../../runtime/stack/orchestration/services";
import { bootstrapOfficialRepository } from "../bootstrap";

export async function servicesCommand(
    args: readonly string[],
    paths: UlviaPaths,
    installation: InstallationConfig,
    log: (message: string) => void,
): Promise<void> {
    const [action, ...rest] = args;
    if (action === "start" || action === "upgrade") {
        expectNone(rest, `Usage: ulvia services ${action}`);
        await startLocalServices(paths, installation, log, {
            allowUpgrade: action === "upgrade",
            prepare: async () => {
                log("Preparing bundled official resources...");
                await bootstrapOfficialRepository(paths.repository);
            },
        });
        return;
    }
    if (action === "stop") {
        expectNone(rest, "Usage: ulvia services stop");
        await stopLocalServices(paths, installation);
        log("Shared services stopped. Instances and persistent data were retained.");
        return;
    }
    if (action === "status") {
        expectNone(rest, "Usage: ulvia services status");
        await printServicesStatus(paths, installation, log);
        return;
    }
    if (action === "logs") {
        await showLocalLogs(rest, { logs: paths.serviceLogs }, log, "ulvia services logs");
        return;
    }
    throw new Error("Usage: ulvia services <start | stop | status | upgrade | logs>");
}

async function printServicesStatus(
    paths: UlviaPaths,
    installation: InstallationConfig,
    log: (message: string) => void,
): Promise<void> {
    const { state, services } = await describeLocalServices(paths, installation);
    const expected = ["proxy", "mongo", "provider", "repository"];
    log(`Shared services: ${allHealthy(expected, services) ? "running" : aggregateStatus(services)}`);
    log(`Version: ${state?.version ?? "not initialized"}`);
    for (const name of expected) {
        const service = services.find((candidate) => candidate.service === name);
        log(`${serviceLabel(name)}: ${serviceStatus(service)}`);
    }
    log(`Persistent data: ${paths.data}`);
}

export function aggregateStatus(services: readonly ComposeServiceState[]): "stopped" | "degraded" {
    return services.some(({ state }) => state === "running") ? "degraded" : "stopped";
}

function allHealthy(expected: readonly string[], services: readonly ComposeServiceState[]): boolean {
    return expected.every((name) =>
        services.some(
            ({ service, state, health }) =>
                service === name && state === "running" && (!health || health === "healthy"),
        ),
    );
}

function serviceStatus(service: ComposeServiceState | undefined): string {
    return service ? [service.state, service.health].filter(Boolean).join(" / ") : "stopped";
}

function serviceLabel(service: string): string {
    return (
        { proxy: "Local proxy", mongo: "MongoDB", provider: "Ulvia Provider", repository: "Repository" }[service] ??
        service
    );
}

function expectNone(args: readonly string[], usage: string): void {
    if (args.length > 0) {
        throw new Error(usage);
    }
}
