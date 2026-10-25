import { readdir } from "node:fs/promises";
import { provisionLocalInstance } from "../../runtime/instance";
import { loadLocalInstanceConfig, loadOrCreateLocalInstanceConfig, validHostname } from "../../runtime/instanceConfig";
import { loadLocalInstanceConnection, saveLocalInstanceConnection } from "../../runtime/instanceConnection";
import {
    assertLocalInstanceName,
    ensureLocalInstancePaths,
    resolveLocalInstancePaths,
    type UlviaPaths,
} from "../../runtime/paths";
import type { InstallationConfig } from "../../runtime/stack/installation";
import { releaseInstanceDomain, reserveInstanceDomain } from "../../runtime/stack/domains";
import { instancePublicUrl, localInstanceHostname } from "../../runtime/stack/ports";
import { providerOperatorAccess, startLocalKernel } from "../../runtime/stack/orchestration/instances";
import { assertProviderRunning, listInstances, runExistingInstanceCommand } from "./instanceOperations";

export async function instanceCommand(
    args: readonly string[],
    paths: UlviaPaths,
    installation: InstallationConfig,
    log: (message: string) => void,
): Promise<void> {
    const [action, ...rest] = args;
    if (action === "create") {
        const name = rest[0] ?? "";
        const options = parseCreateOptions(rest.slice(1));
        await createNamedInstance(paths, name, options, log);
        return;
    }
    if (action === "list") {
        expectCount(rest, 0, "Usage: ulvia instance list");
        await listInstances(paths, installation, log);
        return;
    }
    if (["start", "stop", "status", "credentials", "delete", "logs"].includes(action ?? "")) {
        await runExistingInstanceCommand(action as string, rest, paths, log);
        return;
    }
    throw new Error("Usage: ulvia instance <create | list | start | stop | status | credentials | logs | delete>");
}

async function createNamedInstance(
    paths: UlviaPaths,
    name: string,
    options: Readonly<{ label?: string; domain?: string }>,
    log: (message: string) => void,
): Promise<void> {
    assertLocalInstanceName(name);
    const services = await assertProviderRunning(paths);
    const instancePaths = resolveLocalInstancePaths(paths, name);
    await ensureLocalInstancePaths(instancePaths);
    if (await loadLocalInstanceConnection(instancePaths.root)) {
        throw new Error(`Local instance already exists: ${name}`);
    }
    const hostname = options.domain ?? localInstanceHostname(name);
    if (services.installation.tls.mode === "acme" && !options.domain) {
        throw new Error("An ACME installation requires --domain when creating an instance");
    }
    await assertHostnameAvailable(paths, name, hostname);
    const reservationCreated = await reserveInstanceDomain(paths, name, hostname);
    let provisioned = false;
    try {
        const config = await loadOrCreateLocalInstanceConfig(instancePaths.root, {
            name,
            label: options.label ?? defaultLabel(name),
            hostname,
        });
        const operator = await providerOperatorAccess(paths, services);
        const connection = await provisionLocalInstance(
            operator.url,
            operator.token,
            config,
            instancePublicUrl(hostname, services.installation),
        );
        await saveLocalInstanceConnection(instancePaths.root, connection);
        provisioned = true;
        log(`Provisioned Provider instance ${name}.`);
        await startLocalKernel(paths, name, log);
        log(`Credentials: ulvia instance credentials ${name}`);
    } catch (error) {
        if (reservationCreated && !provisioned) {
            await releaseInstanceDomain(paths, name, hostname);
        }
        throw error;
    }
}

function defaultLabel(name: string): string {
    return `Local ${name}`;
}

function parseCreateOptions(args: readonly string[]): Readonly<{ label?: string; domain?: string }> {
    if (args.length % 2 !== 0) {
        throw new Error(createUsage());
    }
    const values = new Map<string, string>();
    for (let index = 0; index < args.length; index += 2) {
        const key = args[index] ?? "";
        const value = args[index + 1]?.trim() ?? "";
        if (!["--label", "--domain"].includes(key) || !value || values.has(key)) {
            throw new Error(createUsage());
        }
        values.set(key, value);
    }
    const label = values.get("--label");
    if (label && (label.length > 80 || /[\u0000-\u001f\u007f]/u.test(label))) {
        throw new Error("Instance label must contain at most 80 printable characters");
    }
    const domain = values.get("--domain");
    if (domain && !validHostname(domain)) {
        throw new Error("Instance domain must be a lowercase DNS hostname");
    }
    return { ...(label ? { label } : {}), ...(domain ? { domain } : {}) };
}

async function assertHostnameAvailable(paths: UlviaPaths, instanceName: string, hostname: string): Promise<void> {
    for (const name of await listInstanceDirectoryNames(paths)) {
        const config = await loadLocalInstanceConfig(resolveLocalInstancePaths(paths, name).root);
        if (config?.hostname === hostname && config.name !== instanceName) {
            throw new Error(`Instance domain is already used by ${config.name}: ${hostname}`);
        }
    }
}

async function listInstanceDirectoryNames(paths: UlviaPaths): Promise<string[]> {
    return (await readdir(paths.instances, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
        .map(({ name }) => name);
}

function createUsage(): string {
    return "Usage: ulvia instance create <name> [--label <label>] [--domain <domain>]";
}

function expectCount(args: readonly string[], count: number, usage: string): void {
    if (args.length !== count) {
        throw new Error(usage);
    }
}
