import { ProviderConnectionConflict } from "./interfaces";
import { GatewayProviderClient } from "./GatewayProviderClient";

export interface ProviderConnection {
    readonly connectionId: string;
    readonly cmsUrl: string;
    readonly token: string;
    readonly generation: number;
}
export interface ProviderConnectionStorage {
    get(key: string): Promise<string | null | undefined>;
    compareAndSet(key: string, expected: string | null, value: string): Promise<boolean>;
}

/** Inject an encrypted, account-bound store at the receiving Provider runtime. */
export class ProviderConnections {
    constructor(private readonly storage: ProviderConnectionStorage) {}
    async configure(value: ProviderConnection) {
        if (
            !Number.isSafeInteger(value.generation) ||
            value.generation < 1 ||
            !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value.connectionId) ||
            !/^[\x21-\x7e]{32,4096}$/u.test(value.token)
        ) {
            throw new TypeError("Invalid Provider connection");
        }
        const url = new URL(value.cmsUrl);
        if (
            url.username ||
            url.password ||
            url.search ||
            url.hash ||
            url.pathname !== "/" ||
            !["https:", "http:"].includes(url.protocol)
        ) {
            throw new TypeError("Invalid CMS URL");
        }
        const storageKey = key(value.connectionId);
        const normalized = {
            connectionId: value.connectionId,
            cmsUrl: url.origin,
            token: value.token,
            generation: value.generation,
        };
        for (let attempt = 0; attempt < 4; attempt++) {
            const previous = (await this.storage.get(storageKey)) ?? null;
            const current = previous ? (JSON.parse(previous) as ProviderConnection) : null;
            if (current && current.generation >= value.generation) {
                if (
                    current.generation !== value.generation ||
                    current.token !== value.token ||
                    current.cmsUrl !== url.origin
                ) {
                    throw new ProviderConnectionConflict();
                }
                return { connectionId: value.connectionId, configured: true };
            }
            if (await this.storage.compareAndSet(storageKey, previous, JSON.stringify(normalized))) {
                return { connectionId: value.connectionId, configured: true };
            }
        }
        throw new ProviderConnectionConflict();
    }

    client(connectionId: string, allowPrivateAddresses = false) {
        return {
            invoke: async (...args: Parameters<GatewayProviderClient["invoke"]>) => {
                const connection = await this.get(connectionId);
                if (!connection) {
                    throw new Error("Provider connection is not configured");
                }
                return new GatewayProviderClient({ ...connection, allowPrivateAddresses }).invoke(...args);
            },
        };
    }
    async get(connectionId: string): Promise<ProviderConnection | null> {
        const value = await this.storage.get(key(connectionId));
        return value ? (JSON.parse(value) as ProviderConnection) : null;
    }
}
function key(id: string) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(id)) {
        throw new TypeError("Invalid connection identifier");
    }
    return `PROVIDER_CONNECTION_${Buffer.from(id).toString("hex").toUpperCase()}`;
}
