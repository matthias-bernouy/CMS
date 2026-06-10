import type { SecretStore } from "cms-secrets/interfaces/SecretStore";

/**
 * In-memory `SecretStore` implementation. Adequate for dev, tests, and
 * single-process deployments where secrets only need to live for the
 * lifetime of the running CMS. Production multi-instance setups should
 * swap in a backed implementation (Vault, AWS Secrets Manager, …) without
 * touching consumers — the interface is the only contract.
 *
 * Values are stored plain. The interface deliberately doesn't promise
 * encryption-at-rest; that's an implementation concern of backed stores.
 */
export class InMemorySecretStore implements SecretStore {

    private _data = new Map<string, string>();

    async get(key: string): Promise<string | null> {
        return this._data.get(key) ?? null;
    }

    async set(key: string, value: string): Promise<void> {
        this._data.set(key, value);
    }

    async delete(key: string): Promise<void> {
        this._data.delete(key);
    }

    async list(): Promise<Array<{ key: string; value: string }>> {
        return Array.from(this._data, ([key, value]) => ({ key, value }));
    }

    async listKeys(): Promise<string[]> {
        return Array.from(this._data.keys());
    }
}
