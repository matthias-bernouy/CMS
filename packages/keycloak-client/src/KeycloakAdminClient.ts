import { KeycloakClientError, type KeycloakClientErrorCode } from "./KeycloakClientError";

/**
 * Thin typed wrapper around Keycloak's REST admin API. Just enough to
 * provision a fresh tenant from the central orchestrator (`hub`):
 *
 *   1. createRealm                    — new realm + (optional) SMTP config
 *   2. createConfidentialClient       — OIDC client for the CMS web app
 *   3. createPublicClient             — OIDC client for the CLI device flow
 *   4. createRealmRole                — `admin` (or whatever)
 *   5. createUser                     — first user (no password set)
 *   6. assignRealmRoleToUser          — promote that user to `admin`
 *   7. sendActionsEmail               — magic link "set your password"
 *   8. deleteRealm                    — nuclear rollback if mid-provision fails
 *
 * Idempotence is the orchestrator's concern: every method is a strict CREATE
 * that throws `KeycloakClientError({ code: "conflict" })` on duplicates. The
 * caller catches conflict on retry and continues.
 *
 * Auth: `client_credentials` against a service account (typically in `master`
 * realm with `create-realm` + `realm-management/*` perms). Token is acquired
 * lazily on first request, cached, and refreshed 30s before expiry.
 */
export class KeycloakAdminClient {

    private readonly _baseUrl: string;
    private readonly _auth:    KeycloakAdminAuth;
    private readonly _fetch:   typeof fetch;
    private _cachedToken:      { value: string; expiresAt: number } | null = null;

    constructor(config: KeycloakAdminClientConfig) {
        this._baseUrl = config.baseUrl.replace(/\/+$/, "");
        this._auth    = config.auth;
        this._fetch   = config.fetch ?? globalThis.fetch.bind(globalThis);
    }

    // ── Realms ─────────────────────────────────────────────────────────

    async createRealm(input: { realm: string; displayName?: string; smtp?: SmtpConfig }): Promise<void> {
        const body: Record<string, unknown> = { realm: input.realm, enabled: true };
        if (input.displayName) body.displayName = input.displayName;
        if (input.smtp)        body.smtpServer  = mapSmtp(input.smtp);
        const res = await this._request("POST", "/realms", body);
        await assertOk(res, "createRealm");
    }

    async deleteRealm(realm: string): Promise<void> {
        const res = await this._request("DELETE", `/realms/${enc(realm)}`);
        await assertOk(res, "deleteRealm");
    }

    // ── Clients ────────────────────────────────────────────────────────

    async createConfidentialClient(realm: string, input: ConfidentialClientInput): Promise<{ clientUuid: string; clientSecret: string }> {
        const body: Record<string, unknown> = {
            clientId:                  input.clientId,
            protocol:                  "openid-connect",
            publicClient:              false,
            standardFlowEnabled:       true,
            directAccessGrantsEnabled: false,
            serviceAccountsEnabled:    input.serviceAccountsEnabled ?? false,
            redirectUris:              input.redirectUris,
            webOrigins:                input.webOrigins ?? [],
            ...(input.postLogoutRedirectUris ? {
                attributes: { "post.logout.redirect.uris": input.postLogoutRedirectUris.join("##") },
            } : {}),
        };
        const res = await this._request("POST", `/realms/${enc(realm)}/clients`, body);
        await assertOk(res, "createConfidentialClient");

        const clientUuid = extractIdFromLocation(res, "createConfidentialClient");
        const secretRes = await this._request("GET", `/realms/${enc(realm)}/clients/${clientUuid}/client-secret`);
        await assertOk(secretRes, "getClientSecret");
        const secretJson = await secretRes.json() as { value: string };
        return { clientUuid, clientSecret: secretJson.value };
    }

    async createPublicClient(realm: string, input: PublicClientInput): Promise<{ clientUuid: string }> {
        const body: Record<string, unknown> = {
            clientId:                  input.clientId,
            protocol:                  "openid-connect",
            publicClient:              true,
            standardFlowEnabled:       input.standardFlowEnabled ?? false,
            directAccessGrantsEnabled: false,
            attributes: {
                "oauth2.device.authorization.grant.enabled": String(input.oauth2DeviceAuthorizationGrantEnabled ?? true),
            },
        };
        const res = await this._request("POST", `/realms/${enc(realm)}/clients`, body);
        await assertOk(res, "createPublicClient");
        return { clientUuid: extractIdFromLocation(res, "createPublicClient") };
    }

    // ── Roles ──────────────────────────────────────────────────────────

    async createRealmRole(realm: string, input: { name: string; description?: string }): Promise<void> {
        const body: Record<string, unknown> = { name: input.name };
        if (input.description) body.description = input.description;
        const res = await this._request("POST", `/realms/${enc(realm)}/roles`, body);
        await assertOk(res, "createRealmRole");
    }

    // ── Users ──────────────────────────────────────────────────────────

    async createUser(realm: string, input: UserInput): Promise<string> {
        const body: Record<string, unknown> = {
            username: input.username,
            enabled:  input.enabled ?? true,
        };
        if (input.email         !== undefined) body.email         = input.email;
        if (input.firstName     !== undefined) body.firstName     = input.firstName;
        if (input.lastName      !== undefined) body.lastName      = input.lastName;
        if (input.emailVerified !== undefined) body.emailVerified = input.emailVerified;
        const res = await this._request("POST", `/realms/${enc(realm)}/users`, body);
        await assertOk(res, "createUser");
        return extractIdFromLocation(res, "createUser");
    }

    async assignRealmRoleToUser(realm: string, userId: string, roleName: string): Promise<void> {
        // Keycloak wants the full RoleRepresentation (id + name) in the assignment body, not just the name.
        const roleRes = await this._request("GET", `/realms/${enc(realm)}/roles/${enc(roleName)}`);
        await assertOk(roleRes, `assignRealmRoleToUser:lookup(${roleName})`);
        const role = await roleRes.json() as { id: string; name: string };

        const res = await this._request("POST", `/realms/${enc(realm)}/users/${enc(userId)}/role-mappings/realm`, [{ id: role.id, name: role.name }]);
        await assertOk(res, "assignRealmRoleToUser");
    }

    async sendActionsEmail(realm: string, userId: string, actions: KeycloakUserAction[], options: SendActionsOptions = {}): Promise<void> {
        const params = new URLSearchParams();
        if (options.lifespan)    params.set("lifespan",    String(options.lifespan));
        if (options.redirectUri) params.set("redirect_uri", options.redirectUri);
        if (options.clientId)    params.set("client_id",    options.clientId);
        const qs = params.toString();
        const path = `/realms/${enc(realm)}/users/${enc(userId)}/execute-actions-email${qs ? "?" + qs : ""}`;
        const res = await this._request("PUT", path, actions);
        await assertOk(res, "sendActionsEmail");
    }

    /**
     * Returns a valid access token for the configured service account, fetching
     * one if no cache exists or refreshing 30s before expiry. Re-exposed publicly
     * so consumers (e.g. the hub) can pass the same JWT to other downstream
     * services that trust this realm — no need to re-implement the token cache.
     */
    async getAccessToken(): Promise<string> {
        return this._getToken();
    }

    // ── private ────────────────────────────────────────────────────────

    private async _getToken(): Promise<string> {
        if (this._cachedToken && this._cachedToken.expiresAt - 30_000 > Date.now()) {
            return this._cachedToken.value;
        }
        const tokenUrl = `${this._baseUrl}/realms/${enc(this._auth.realm)}/protocol/openid-connect/token`;
        const body = new URLSearchParams({
            grant_type:    "client_credentials",
            client_id:     this._auth.clientId,
            client_secret: this._auth.clientSecret,
        });
        const res = await this._fetch(tokenUrl, {
            method:  "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body:    body.toString(),
        });
        if (!res.ok) {
            throw new KeycloakClientError("unauthorized", `Failed to acquire admin token (HTTP ${res.status})`, res.status);
        }
        const json = await res.json() as { access_token: string; expires_in: number };
        this._cachedToken = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
        return json.access_token;
    }

    private async _request(method: string, path: string, body?: unknown): Promise<Response> {
        const token = await this._getToken();
        return this._fetch(`${this._baseUrl}/admin${path}`, {
            method,
            headers: {
                Authorization: `Bearer ${token}`,
                ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
            },
            ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        });
    }
}

// ── helpers ────────────────────────────────────────────────────────────

const enc = encodeURIComponent;

async function assertOk(res: Response, op: string): Promise<void> {
    if (res.ok) return;
    let detail: string | undefined;
    try {
        const json = await res.json() as { errorMessage?: string; error?: string; error_description?: string };
        detail = json.errorMessage ?? json.error_description ?? json.error;
    } catch { /* body wasn't JSON, fall through to status */ }
    const code: KeycloakClientErrorCode =
        res.status === 401 ? "unauthorized" :
        res.status === 403 ? "forbidden"    :
        res.status === 404 ? "not_found"    :
        res.status === 409 ? "conflict"     :
        res.status >= 400 && res.status < 500 ? "validation_error" :
        "unknown";
    throw new KeycloakClientError(code, `${op} failed: ${detail ?? `HTTP ${res.status}`}`, res.status);
}

function extractIdFromLocation(res: Response, op: string): string {
    const location = res.headers.get("Location");
    const id = location?.split("/").pop();
    if (!id) throw new KeycloakClientError("unknown", `${op}: Keycloak response missing Location header`, res.status);
    return id;
}

/**
 * Maps the user-friendly SmtpConfig to Keycloak's flat string-typed wire shape
 * (`auth: "true"`, `port: "587"` — yes, Keycloak's admin API expects strings here).
 */
function mapSmtp(smtp: SmtpConfig): Record<string, string> {
    const out: Record<string, string> = {
        host:            smtp.host,
        port:            String(smtp.port),
        from:            smtp.from,
        fromDisplayName: smtp.fromDisplayName ?? "",
        auth:            String(smtp.auth ?? false),
        starttls:        String(smtp.starttls ?? true),
        ssl:             String(smtp.ssl ?? false),
    };
    if (smtp.user)     out.user     = smtp.user;
    if (smtp.password) out.password = smtp.password;
    if (smtp.replyTo)  out.replyTo  = smtp.replyTo;
    return out;
}

// ── public types ───────────────────────────────────────────────────────

export type KeycloakAdminAuth = {
    type:         "client-credentials";
    /** Realm hosting the service account (typically `master`). */
    realm:        string;
    clientId:     string;
    clientSecret: string;
};

export type KeycloakAdminClientConfig = {
    /** Keycloak base URL — no trailing slash, no `/admin` suffix (the client adds it). */
    baseUrl: string;
    auth:    KeycloakAdminAuth;
    /** Optional fetch implementation (override for tests / Node before global fetch). */
    fetch?:  typeof fetch;
};

export type SmtpConfig = {
    host:             string;
    port:             number;
    from:             string;
    fromDisplayName?: string;
    auth?:            boolean;
    user?:            string;
    password?:        string;
    starttls?:        boolean;
    ssl?:             boolean;
    replyTo?:         string;
};

export type ConfidentialClientInput = {
    clientId:                string;
    redirectUris:            string[];
    postLogoutRedirectUris?: string[];
    webOrigins?:             string[];
    serviceAccountsEnabled?: boolean;
};

export type PublicClientInput = {
    clientId:                               string;
    standardFlowEnabled?:                   boolean;
    oauth2DeviceAuthorizationGrantEnabled?: boolean;
};

export type UserInput = {
    username:       string;
    email?:         string;
    firstName?:     string;
    lastName?:      string;
    enabled?:       boolean;
    emailVerified?: boolean;
};

export type KeycloakUserAction =
    | "VERIFY_EMAIL"
    | "UPDATE_PASSWORD"
    | "CONFIGURE_TOTP"
    | "UPDATE_PROFILE"
    | "terms_and_conditions";

export type SendActionsOptions = {
    /** Lifespan of the magic-link token, in seconds. Default = Keycloak realm setting. */
    lifespan?:    number;
    /** Where the user lands after performing the actions. Must be a registered redirect URI of `clientId`. */
    redirectUri?: string;
    /** Client whose redirect URIs are checked against `redirectUri`. Default = `account`. */
    clientId?:    string;
};
