import type { Authentication, DefaultRole, Subject } from "@bernouy/socle";

type InMemoryAuthConfig<Role extends string> = {
    role: Role;
    identifier?: string;
    displayName?: string;
    /** Base URL used to validate that `returnTo` is a relative path. Defaults to "http://localhost". */
    baseUrl?: string;
};

/**
 * Dev-only implementation of `Authentication`. No login flow, no session —
 * every request is considered authenticated as a fixed subject.
 *
 * Usage:
 * ```ts
 * const auth = new InMemoryAuthentication({ role: 'admin', displayName: 'Dev Admin' });
 * ```
 */
export class InMemoryAuthentication<Role extends string = DefaultRole>
    implements Authentication<Role>
{
    readonly loginUrl:   string = "/__dev/login";
    readonly logoutUrl:  string = "/__dev/logout";
    readonly profileUrl: string = "/__dev/profile";

    private readonly _subject: Subject<Role>;
    private readonly _baseUrl: string;

    constructor(config: InMemoryAuthConfig<Role>) {
        this._subject = {
            identifier:  config.identifier  ?? "dev-user",
            role:        config.role,
            displayName: config.displayName ?? `Dev ${config.role}`,
        };
        this._baseUrl = config.baseUrl ?? "http://localhost";
    }

    buildLoginUrl(returnTo: string): string {
        this._assertRelative(returnTo);
        return `${this.loginUrl}?returnTo=${encodeURIComponent(returnTo)}`;
    }

    buildLogoutUrl(returnTo: string): string {
        this._assertRelative(returnTo);
        return `${this.logoutUrl}?returnTo=${encodeURIComponent(returnTo)}`;
    }

    async getSubject(_req: Request): Promise<Subject<Role>> {
        return { ...this._subject };
    }

    // ── Private ──

    private _assertRelative(returnTo: string): void {
        try {
            // A relative path can't be parsed as an absolute URL on its own.
            // If it can, it's potentially an open-redirect target.
            const url = new URL(returnTo);
            if (url.origin !== this._baseUrl) {
                throw new Error(`returnTo must be a relative path, got: "${returnTo}"`);
            }
        } catch (e) {
            if (e instanceof TypeError) return; // expected: not a valid absolute URL → it's relative, all good
            throw e;
        }
    }
}