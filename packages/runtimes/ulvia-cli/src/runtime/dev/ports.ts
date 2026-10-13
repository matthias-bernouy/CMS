import type { DevPorts } from "../cms";

const DEFAULT_PORTS: DevPorts = Object.freeze({
    kernel: 5100,
    mongo: 27019,
    repository: 5102,
    provider: 5103,
});

export function resolveDevPorts(environment: Record<string, string | undefined>): DevPorts {
    const configuredProviderPort = environment.ULVIA_DEV_PROVIDER_PORT?.trim();
    if (configuredProviderPort && configuredProviderPort !== String(DEFAULT_PORTS.provider)) {
        throw new Error(
            `ULVIA_DEV_PROVIDER_PORT cannot override the official Provider origin; expected ${DEFAULT_PORTS.provider}`,
        );
    }
    const ports: DevPorts = {
        kernel: readPort(environment, "ULVIA_DEV_KERNEL_PORT", DEFAULT_PORTS.kernel),
        mongo: readPort(environment, "ULVIA_DEV_MONGO_PORT", DEFAULT_PORTS.mongo),
        repository: readPort(environment, "ULVIA_DEV_REPOSITORY_PORT", DEFAULT_PORTS.repository),
        provider: DEFAULT_PORTS.provider,
    };
    if (new Set(Object.values(ports)).size !== Object.values(ports).length) {
        throw new Error("Ulvia dev ports must be distinct");
    }
    return ports;
}

function readPort(environment: Record<string, string | undefined>, name: string, fallback: number): number {
    const raw = environment[name]?.trim();
    if (!raw) {
        return fallback;
    }
    const port = Number(raw);
    if (!/^\d+$/u.test(raw) || !Number.isInteger(port) || port < 1 || port > 65_535) {
        throw new Error(`${name} must be an integer between 1 and 65535`);
    }
    return port;
}
