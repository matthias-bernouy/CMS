/**
 * Role set assumed by the default providers shipped with this package.
 * Consumers needing custom roles should parameterize the generic
 * interfaces with their own string union, e.g.
 * `Authentication<'admin' | 'editor' | 'viewer'>`.
 */
export type DefaultRole = 'admin' | 'user';

/**
 * Minimal view of an authenticated user, returned by `getSubject`.
 *
 * @typeParam Role - String union of roles. Defaults to `DefaultRole`.
 */
export interface Subject<Role extends string = DefaultRole> {
    /** Stable, opaque identifier for the user (not an email or display name). */
    identifier: string;
    /** Role assigned to this user. */
    role: Role;
    /**
     * Human-friendly name for display in UIs (header, dropdowns). Optional
     * because the identifier is the only thing the contract guarantees; some
     * providers expose nothing else.
     */
    displayName?: string;
}

/**
 * Contract exposed to applications that need to authenticate users.
 * Implementations are provided by auth backends (OIDC, local, mock, etc.).
 * The interface is intentionally framework-agnostic: it builds URLs and
 * reads the session from a standard Request, but never writes to a Response.
 * Applications remain in control of HTTP side-effects (redirects, cookies).
 *
 * @typeParam Role - String union of roles supported by the implementation.
 */
export interface Authentication<Role extends string = DefaultRole> {

    /**
     * URL of the login page. Suitable for use in anchor tags or client-side
     * navigation. Use `buildLoginUrl` when a post-login redirect is needed.
     */
    readonly loginUrl: string;

    /**
     * URL that triggers a logout. Suitable for static links (e.g. in a
     * dropdown). Use `buildLogoutUrl` to pass a `returnTo` destination.
     */
    readonly logoutUrl: string;

    /**
     * URL of the current user's profile page. The implementation decides
     * whether this is user-specific or a generic route that resolves
     * server-side.
     */
    readonly profileUrl: string;

    /**
     * Builds a login URL that will redirect the user to `returnTo` after
     * successful authentication. Implementations MUST validate `returnTo`
     * to prevent open-redirect attacks (e.g. reject absolute URLs to
     * foreign origins).
     *
     * @param returnTo - Relative path to redirect to post-login (e.g. "/dashboard").
     * @returns The login URL with the return destination encoded.
     */
    buildLoginUrl(returnTo: string): string;

    /**
     * Builds a logout URL that will redirect the user to `returnTo` after
     * the logout flow completes. Same open-redirect validation rules as
     * `buildLoginUrl`.
     */
    buildLogoutUrl(returnTo: string): string;

    /**
     * Resolves the Subject associated with the incoming request's session.
     *
     * Implementations should be side-effect free from the caller's perspective:
     * calling this method multiple times on the same request MUST yield the
     * same result and MUST NOT mutate the request or response.
     *
     * Returns `null` on any failure mode (no session, expired session,
     * invalid signature, etc.). Implementations MUST NOT throw for routine
     * "not authenticated" cases — thrown errors are reserved for bugs.
     *
     * @param req - The incoming HTTP request carrying the session (cookie, header, etc.).
     * @returns The authenticated Subject, or `null` if the session is absent,
     *          expired, or otherwise invalid.
     */
    getSubject(req: Request): Promise<Subject<Role> | null>;
}
