import type { UlviaPaths } from "../../runtime/paths";
import type { InstallationConfig } from "../../runtime/stack/installation";
import type { ComposeServiceState } from "../../runtime/stack/orchestration/compose";
import {
    describeLocalServices,
    showServiceDiagnostics,
    startLocalServices,
    stopLocalServices,
} from "../../runtime/stack/orchestration/services";
import { assertImageVersion } from "../../runtime/stack/orchestration/images";
import { DEFAULT_STACK_VERSION } from "../../runtime/stack/version";

const SERVICES_HELP = `Usage: ulvia services <start | stop | status | logs>

Manage the shared proxy, MongoDB, Repository, and Provider.`;

const START_HELP = `Usage: ulvia services start [--version <version>]

Start shared services. On their first start, use the bundled stack version by
default or the exact version supplied here. Existing installations keep their
pinned image digests; use ulvia upgrade for later changes.

Bundled initial stack version: ${DEFAULT_STACK_VERSION}`;

export async function servicesCommand(
    args: readonly string[],
    paths: UlviaPaths,
    installation: InstallationConfig,
    log: (message: string) => void,
): Promise<void> {
    const [action, ...rest] = args;
    if (!action || action === "help" || action === "--help" || action === "-h") {
        log(SERVICES_HELP);
        return;
    }
    if (action === "start") {
        if (isHelp(rest)) {
            log(START_HELP);
            return;
        }
        await startLocalServices(paths, installation, log, parseStartVersion(rest));
        return;
    }
    if (action === "stop") {
        expectNone(rest, "Usage: ulvia services stop");
        await stopLocalServices(paths);
        log("Shared services stopped. Instances and persistent data were retained.");
        return;
    }
    if (action === "status") {
        expectNone(rest, "Usage: ulvia services status");
        await printServicesStatus(paths, log);
        return;
    }
    if (action === "logs") {
        await showServiceDiagnostics(paths, rest);
        return;
    }
    throw new Error("Usage: ulvia services <start | stop | status | logs>");
}

export function parseStartVersion(
    args: readonly string[],
    usage = "Usage: ulvia services start [--version <version>]",
): string | undefined {
    if (args.length === 0) {
        return undefined;
    }
    if (args.length !== 2 || args[0] !== "--version" || !args[1]) {
        throw new Error(usage);
    }
    assertImageVersion(args[1]);
    return args[1];
}

function isHelp(args: readonly string[]): boolean {
    return args.length === 1 && (args[0] === "help" || args[0] === "--help" || args[0] === "-h");
}

async function printServicesStatus(paths: UlviaPaths, log: (message: string) => void): Promise<void> {
    const { state, services } = await describeLocalServices(paths);
    const expected = ["proxy", "mongo", "provider", "repository"];
    log(`Shared services: ${allHealthy(expected, services) ? "running" : aggregateStatus(services)}`);
    log(`Provider version: ${state?.images.provider.version ?? "not initialized"}`);
    log(`Repository version: ${state?.images.repository.version ?? "not initialized"}`);
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
