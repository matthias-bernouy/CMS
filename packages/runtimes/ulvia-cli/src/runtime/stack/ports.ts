export type ServicePorts = Readonly<{
    http: number;
    repository: number;
    provider: number;
}>;

const DEFAULT_PORTS: ServicePorts = Object.freeze({
    http: 5100,
    repository: 5102,
    provider: 5103,
});

export function resolveServicePorts(environment: Record<string, string | undefined>): ServicePorts {
    const ports: ServicePorts = {
        http: readPort(environment, "ULVIA_HTTP_PORT", DEFAULT_PORTS.http),
        repository: readPort(environment, "ULVIA_REPOSITORY_PORT", DEFAULT_PORTS.repository),
        provider: readPort(environment, "ULVIA_PROVIDER_PORT", DEFAULT_PORTS.provider),
    };
    if (new Set(Object.values(ports)).size !== Object.values(ports).length) {
        throw new Error("Ulvia local ports must be distinct");
    }
    return ports;
}

export function localInstanceHostname(name: string): string {
    return name === "default" ? "localhost" : `${name}.localhost`;
}

export function instancePublicUrl(
    hostname: string,
    network: Readonly<{
        ports: ServicePorts;
        tls: Readonly<{ mode: "disabled" } | { mode: "acme"; httpsPort: number }>;
    }>,
): string {
    if (network.tls.mode === "acme") {
        return `https://${hostname}${network.tls.httpsPort === 443 ? "" : `:${network.tls.httpsPort}`}`;
    }
    return `http://${hostname}${network.ports.http === 80 ? "" : `:${network.ports.http}`}`;
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
