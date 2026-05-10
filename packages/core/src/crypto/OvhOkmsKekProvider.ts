import { readFileSync } from "node:fs";
import type { KekProvider } from "./KekProvider";

const DEK_BYTES = 32;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BACKOFF_MS  = 250;

/**
 * Configuration for `OvhOkmsKekProvider`. The same OKMS domain that
 * already serves the service's bundle (Vault-style KV2 secrets) hosts
 * the service key (CMK) used here — one access cert covers both
 * surfaces. The CMK itself never leaves OVH's HSM; the provider only
 * round-trips wrapped DEK material over mTLS.
 */
export type OvhOkmsKekProviderConfig = {
    /** OVH region, e.g. `eu-west-rbx` / `eu-west-par` / `eu-west-sbg`. */
    region: string;
    /** OKMS domain UUID (the `OKMS_DOMAIN_ID` already used for secrets). */
    domainId: string;
    /** Service key UUID created in Manager → Encryption keys, with
     *  operations `wrapKey, unwrapKey` (and matching IAM action grants
     *  `okms:apikms:serviceKey/dataKey/create` + `…/dataKey/decrypt`). */
    keyId: string;
    /** Filesystem paths to the mTLS access cert + key PEM. Same pair
     *  used by `okms-fetch` for the secret bundle pull. */
    certPath: string;
    keyPath:  string;
    /** Override for tests; defaults to `globalThis.fetch`. */
    fetch?: typeof fetch;
    /** Retry budget for 5xx + network errors (4xx fail fast). Default 3. */
    maxRetries?: number;
    /** Initial backoff (ms) between retries; doubles each attempt up to
     *  10s ceiling. Default 250ms. */
    backoffMs?: number;
};

/**
 * OVH OKMS-backed `KekProvider`.
 *
 * Wraps DEKs by calling OVH's REST API:
 *   - generate: `POST /api/{domain}/v1/servicekey/{key}/datakey`
 *               returns `{ key: <JWE>, plaintext: <base64-32B> }`
 *   - unwrap:   `POST /api/{domain}/v1/servicekey/{key}/datakey/decrypt`
 *               returns `{ plaintext: <base64-32B> }`
 *
 * The wrapped form is the JWE string returned by OVH — opaque to us,
 * round-tripped untouched through `unwrap`. mTLS at every call.
 *
 * Logs deliberately never include the plaintext or the JWE — only HTTP
 * status codes and OKMS-side error envelopes (which are safe to log).
 */
export class OvhOkmsKekProvider implements KekProvider {

    private readonly _baseUrl:    string;
    private readonly _fetch:      typeof fetch;
    private readonly _cert:       Buffer;
    private readonly _key:        Buffer;
    private readonly _maxRetries: number;
    private readonly _backoffMs:  number;

    constructor(config: OvhOkmsKekProviderConfig) {
        this._baseUrl = `https://${config.region}.okms.ovh.net/api/${config.domainId}/v1/servicekey/${config.keyId}`;
        this._fetch   = config.fetch ?? globalThis.fetch.bind(globalThis);
        // Read cert + key synchronously at construction so a misconfigured
        // file path fails fast at boot rather than on the first call.
        this._cert    = readFileSync(config.certPath);
        this._key     = readFileSync(config.keyPath);
        this._maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
        this._backoffMs  = config.backoffMs  ?? DEFAULT_BACKOFF_MS;
    }

    async generateDek(): Promise<{ wrapped: string; plaintext: Buffer }> {
        const body = await this._call<OvhDataKeyResponse>("/datakey", {
            name: `dek-${new Date().toISOString()}`,
            size: DEK_BYTES * 8, // OVH expects bits (256), not bytes.
        });
        const plaintext = Buffer.from(body.plaintext, "base64");
        if (plaintext.length !== DEK_BYTES) {
            throw new Error(`OvhOkmsKekProvider: OVH returned a ${plaintext.length}-byte DEK (expected ${DEK_BYTES}).`);
        }
        return { wrapped: body.key, plaintext };
    }

    async unwrap(wrapped: string): Promise<Buffer> {
        const body = await this._call<OvhDecryptResponse>("/datakey/decrypt", { key: wrapped });
        const plaintext = Buffer.from(body.plaintext, "base64");
        if (plaintext.length !== DEK_BYTES) {
            throw new Error(`OvhOkmsKekProvider: OVH unwrap returned a ${plaintext.length}-byte DEK (expected ${DEK_BYTES}).`);
        }
        return plaintext;
    }

    private async _call<T>(path: string, body: unknown): Promise<T> {
        let attempt = 0;
        let delay   = this._backoffMs;
        while (true) {
            attempt++;
            const res = await this._fetchOnce(path, body);
            if (res.kind === "ok")        return res.body as T;
            if (res.kind === "fatal")     throw new OvhOkmsError(res.status, res.message);
            // res.kind === "transient"
            if (attempt >= this._maxRetries) {
                throw new OvhOkmsError(res.status, `${res.message} — gave up after ${attempt} attempts`);
            }
            await sleep(delay);
            delay = Math.min(delay * 2, 10_000);
        }
    }

    private async _fetchOnce(path: string, body: unknown): Promise<FetchOutcome> {
        let res: Response;
        try {
            // Bun's fetch accepts an mTLS pair via the `tls` option.
            res = await this._fetch(`${this._baseUrl}${path}`, {
                method:  "POST",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify(body),
                // Bun-specific fetch option (mTLS); typed via `bun-types`.
                tls: { cert: this._cert, key: this._key },
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { kind: "transient", status: 0, message: `network error: ${message}` };
        }
        if (res.ok) {
            const parsed = await res.json().catch(() => null);
            if (!parsed) return { kind: "fatal", status: res.status, message: "OKMS returned a non-JSON success body" };
            return { kind: "ok", body: parsed };
        }
        const text = await res.text().catch(() => "");
        if (res.status >= 500 || res.status === 408 || res.status === 429) {
            return { kind: "transient", status: res.status, message: text || res.statusText };
        }
        return { kind: "fatal", status: res.status, message: text || res.statusText };
    }
}

type FetchOutcome =
    | { kind: "ok"; body: unknown }
    | { kind: "transient"; status: number; message: string }
    | { kind: "fatal";     status: number; message: string };

type OvhDataKeyResponse = { key: string; plaintext: string };
type OvhDecryptResponse = { plaintext: string };

export class OvhOkmsError extends Error {
    constructor(public readonly status: number, message: string) {
        super(`OVH OKMS ${status > 0 ? `HTTP ${status}` : "transport"}: ${message}`);
        this.name = "OvhOkmsError";
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
