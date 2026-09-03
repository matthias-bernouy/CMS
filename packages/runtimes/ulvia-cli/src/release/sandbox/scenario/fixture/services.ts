import { randomUUID } from "node:crypto";
import { assertIJsonValue } from "@bernouy/cms-integration-packages";
import type { VerificationObject, VerificationValue } from "@bernouy/cms-integration-verification/sdk/v1";
import type { UpgradeFixtureContextV1 } from "@bernouy/cms-integration-verification/upgrade-fixtures/v1";
import type { LocalSupabaseEnvironment } from "../../../../runtime/supabase";
import { fixtureHttpResponse, localServiceUrl } from "./http";
import { boundedObjectPath, encodeIdentifier, requestBody } from "./values";

type AuthService = UpgradeFixtureContextV1["auth"];
type StorageService = UpgradeFixtureContextV1["storage"];
type FunctionsService = UpgradeFixtureContextV1["functions"];

export function createSupabaseFixtureServices(environment: LocalSupabaseEnvironment): Readonly<{
    auth: AuthService;
    storage: StorageService;
    functions: FunctionsService;
}> {
    const request = async (path: string, init: RequestInit = {}) => {
        const key = requiredSecretKey(environment);
        const headers = new Headers(init.headers);
        headers.set("apikey", key);
        headers.set("authorization", `Bearer ${key}`);
        return await fetch(localServiceUrl(environment.apiUrl, path), {
            ...init,
            headers,
        });
    };
    return Object.freeze({
        auth: createAuthService(request),
        storage: createStorageService(request),
        functions: createFunctionsService(request),
    });
}

function createAuthService(request: (path: string, init?: RequestInit) => Promise<Response>): AuthService {
    return Object.freeze({
        createUser: async (input) => {
            if (!input.email?.includes("@") || input.email.length > 320) {
                throw new Error("Upgrade fixture user email is invalid");
            }
            if (input.password !== undefined && (input.password.length < 8 || input.password.length > 256)) {
                throw new Error("Upgrade fixture user password must contain between 8 and 256 characters");
            }
            const appMetadata = input.appMetadata ?? ({} as VerificationObject);
            assertIJsonValue(appMetadata);
            const response = await request("/auth/v1/admin/users", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    email: input.email,
                    password: input.password ?? `Ulvia-${randomUUID()}-A1!`,
                    email_confirm: true,
                    app_metadata: appMetadata,
                }),
            });
            const result = await fixtureHttpResponse(response);
            const body = result.body as Record<string, unknown>;
            if (!result.ok || typeof body?.id !== "string") {
                throw new Error(`Upgrade fixture could not create local user (HTTP ${result.status})`);
            }
            return Object.freeze({ id: body.id, email: input.email });
        },
    });
}

function createStorageService(request: (path: string, init?: RequestInit) => Promise<Response>): StorageService {
    const objectPath = (bucket: string, path: string) =>
        `/storage/v1/object/${encodeIdentifier(bucket)}/${boundedObjectPath(path)}`;
    return Object.freeze({
        ensureBucket: async (bucket, options = {}) => {
            const created = await request("/storage/v1/bucket", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ id: bucket, name: bucket, public: options.public ?? false }),
            });
            if (created.ok) {
                return;
            }
            const existing = await request(`/storage/v1/bucket/${encodeIdentifier(bucket)}`);
            if (!existing.ok) {
                throw new Error(`Upgrade fixture could not ensure Storage bucket "${bucket}"`);
            }
        },
        upload: async (bucket, path, bytes, contentType) => {
            if (bytes.byteLength > 16 * 1024 * 1024 || !contentType || contentType.length > 256) {
                throw new Error("Upgrade fixture Storage upload exceeds its bounded contract");
            }
            const response = await request(objectPath(bucket, path), {
                method: "POST",
                headers: { "content-type": contentType, "x-upsert": "true" },
                body: requestBody(bytes),
            });
            if (!response.ok) {
                throw new Error(`Upgrade fixture could not upload Storage object (HTTP ${response.status})`);
            }
        },
        exists: async (bucket, path) => {
            const response = await request(objectPath(bucket, path));
            await response.body?.cancel();
            if (response.status === 404) {
                return false;
            }
            if (!response.ok) {
                throw new Error(`Upgrade fixture could not inspect Storage object (HTTP ${response.status})`);
            }
            return true;
        },
        download: async (bucket, path) => {
            const response = await request(objectPath(bucket, path));
            if (!response.ok) {
                throw new Error(`Upgrade fixture could not download Storage object (HTTP ${response.status})`);
            }
            return new Uint8Array(await response.arrayBuffer());
        },
    });
}

function createFunctionsService(request: (path: string, init?: RequestInit) => Promise<Response>): FunctionsService {
    return Object.freeze({
        invoke: async (slug: string, body: VerificationValue = null) => {
            assertIJsonValue(body);
            const response = await request(`/functions/v1/${encodeIdentifier(slug)}`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(body),
            });
            return await fixtureHttpResponse(response);
        },
    });
}

function requiredSecretKey(environment: LocalSupabaseEnvironment): string {
    if (!environment.secretKey) {
        throw new Error("Local Supabase did not expose a secret API key for isolated upgrade fixtures");
    }
    return environment.secretKey;
}
