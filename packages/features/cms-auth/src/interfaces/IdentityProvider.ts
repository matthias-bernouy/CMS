/**
 * "Identity as data": the per-tenant set of configured login providers, edited
 * from the admin "Identity" section instead of hardcoded at mount. The CMS
 * brokers each one. Secrets (e.g. `clientSecret`) live in the encrypted
 * `SecretStore`, pointed at by `clientSecretRef` (a key into that store) —
 * the secret value itself is NEVER stored here.
 *
 * This is AUTHN configuration ONLY. It never carries roles or users (authz):
 * a provider is just the SOURCE that, on login, produces an `Identity` which
 * then flows into `UsersRepository`. Removing a provider never deletes users.
 */
export type IdentityProviderKind = "local" | "oidc";

export type IdentityProvider = {
    id: string; // unique per tenant
    kind: IdentityProviderKind;
    displayName: string;
    enabled: boolean; // the builtin `local` is disable-able, not deletable
    icon?: string;
    // OIDC backend fields (absent for `local`):
    issuer?: string;
    authorizationEndpoint?: string;
    tokenEndpoint?: string;
    jwksUri?: string;
    clientId?: string; // public OAuth client id
    clientSecretRef?: string; // key into the encrypted SecretStore — never the secret itself
    scopes?: string[];
    createdAt: Date;
    updatedAt: Date;
};

/** Non-secret descriptor exposed by the public `/auth/methods` endpoint so the
 *  auth blocs can render buttons / forms without knowing any backend detail.
 *  Discriminated by which field is set: `loginUrl` → render a redirect button;
 *  `fields` → render a credentials form. Exactly one is present. */
export type LoginMethod = {
    id: string;
    displayName: string;
    icon?: string;
    /** Redirect providers: where the bloc sends the browser to start login. */
    loginUrl?: string;
    /** Credentials providers: the fields the bloc must collect and POST. */
    fields?: ("email" | "password")[];
};

export type NewIdentityProvider = Omit<IdentityProvider, "createdAt" | "updatedAt">;
export type IdentityProviderPatch = Partial<Omit<IdentityProvider, "id" | "createdAt" | "updatedAt">>;

export interface IdentityProviderRepository {
    list(): Promise<IdentityProvider[]>;
    get(id: string): Promise<IdentityProvider | null>;
    create(input: NewIdentityProvider): Promise<IdentityProvider>;
    update(id: string, patch: IdentityProviderPatch): Promise<IdentityProvider | null>;
    delete(id: string): Promise<boolean>;
}
