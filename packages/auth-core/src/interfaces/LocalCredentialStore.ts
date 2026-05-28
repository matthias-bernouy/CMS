import type { Identity } from "auth-core/interfaces/UsersRepository";

/**
 * Local email/password credentials — the backing store of the built-in
 * `local` identity provider. This is an AUTHENTICATION-secret store: it holds
 * password hashes (never plaintext) and owns their lifecycle (hashing, change,
 * deletion). It is SEPARATE from `UsersRepository` (authz roles); the two link
 * by `sub`.
 *
 * `sub` is a generated, stable id (NOT the email — emails can change). On a
 * successful `verify`, the returned `Identity` flows through `SubjectResolver`
 * into `UsersRepository`, exactly like any other auth backend.
 */
export type LocalCredential = {
    sub:       string;     // stable id, generated at creation
    email:     string;     // unique; the login handle
    createdAt: Date;
    updatedAt: Date;
};

export type NewCredential = {
    email:        string;
    password:     string;
    displayName?: string;
};

export interface LocalCredentialStore {
    /** Register a credential. Hashes the password, generates a `sub`. Rejects a
     *  duplicate email. Returns the identity to feed the authz layer. */
    create(input: NewCredential): Promise<Identity>;

    /** Verify email + password. `null` on unknown email or bad password
     *  (constant-ish: same outcome either way, no email enumeration signal). */
    verify(email: string, password: string): Promise<Identity | null>;

    /** Replace the password for an existing `sub`. `false` when unknown. */
    setPassword(sub: string, password: string): Promise<boolean>;

    /** Lookup by login handle (no secret returned). */
    getByEmail(email: string): Promise<LocalCredential | null>;

    /** Remove a credential. Does NOT touch `UsersRepository`. `false` when unknown. */
    delete(sub: string): Promise<boolean>;

    /** All credentials (no secrets) — for an admin "local users" view. */
    list(): Promise<LocalCredential[]>;
}
