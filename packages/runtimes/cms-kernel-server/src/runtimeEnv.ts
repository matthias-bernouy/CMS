import { parseHttpUrl, parsePort, requiredEnv, type RuntimeEnvSource } from "./runtimeEnvParsing";
import { assertProviderConnectionToken } from "@bernouy/cms-repository/providers/installations";

export { parsePort } from "./runtimeEnvParsing";

export type RuntimeEnv = {
    MODE: "DEV" | "PROD";
    KERNEL_PORT: number;
    KERNEL_HOST: string;
    KERNEL_PUBLIC_URL: string;
    ULVIA_PROVIDER_URL: string;
    ULVIA_INSTANCE_TOKEN: string;
};

export function readRuntimeEnv(source: RuntimeEnvSource): RuntimeEnv {
    const MODE = parseRuntimeMode(source.MODE);
    const KERNEL_PORT = parsePort(source.KERNEL_PORT, "KERNEL_PORT", 3000);
    const KERNEL_PUBLIC_URL = parseHttpUrl(requiredEnv(source, "KERNEL_PUBLIC_URL"), "KERNEL_PUBLIC_URL");
    const providerConfiguration = parseUlviaProviderConfig(source);

    return {
        MODE,
        KERNEL_PORT,
        KERNEL_HOST: parseListenerHost(source.KERNEL_HOST, "KERNEL_HOST"),
        ...providerConfiguration,
        KERNEL_PUBLIC_URL,
    };
}

function parseRuntimeMode(raw: string | undefined): RuntimeEnv["MODE"] {
    const mode = raw?.trim() || "PROD";
    if (mode !== "DEV" && mode !== "PROD") {
        throw new Error("MODE must be DEV or PROD");
    }
    return mode;
}

function parseListenerHost(raw: string | undefined, name: string): string {
    const value = raw?.trim() || "0.0.0.0";
    if (value.length > 253 || /[\s/\\?#@\[\]]/u.test(value)) {
        throw new Error(`${name} must be a hostname or IP address without a port`);
    }
    try {
        new URL(`http://${value.includes(":") ? `[${value}]` : value}/`);
    } catch {
        throw new Error(`${name} must be a hostname or IP address without a port`);
    }
    return value;
}

function parseUlviaProviderConfig(
    source: RuntimeEnvSource,
): Pick<RuntimeEnv, "ULVIA_PROVIDER_URL" | "ULVIA_INSTANCE_TOKEN"> {
    const token = source.ULVIA_INSTANCE_TOKEN;
    requiredEnv(source, "ULVIA_INSTANCE_TOKEN");
    try {
        if (token !== token?.trim()) {
            throw new TypeError("token whitespace");
        }
        assertProviderConnectionToken(token!);
    } catch {
        throw new Error("ULVIA_INSTANCE_TOKEN is invalid");
    }
    return {
        ULVIA_PROVIDER_URL: parseHttpUrl(requiredEnv(source, "ULVIA_PROVIDER_URL"), "ULVIA_PROVIDER_URL"),
        ULVIA_INSTANCE_TOKEN: token!,
    };
}
