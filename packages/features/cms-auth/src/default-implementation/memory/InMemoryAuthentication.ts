import type { Authentication, DefaultRole, Subject } from "cms-auth/interfaces/Authentication";
import { sanitizeReturnTo } from "cms-auth/core/cookies";

export type InMemoryAuthConfig<Role extends string> = {
    role: Role;
    identifier?: string;
    email?: string;
};

/**
 * Dev-only implementation of `Authentication`. No login flow, no session —
 * every request is considered authenticated as a fixed subject.
 */
export class InMemoryAuthentication<Role extends string = DefaultRole>
    implements Authentication<Role>
{
    readonly loginUrl:   string = "/__dev/login";
    readonly logoutUrl:  string = "/__dev/logout";
    readonly profileUrl: string = "/__dev/profile";

    private readonly _subject: Subject<Role>;

    constructor(config: InMemoryAuthConfig<Role>) {
        this._subject = {
            identifier:  config.identifier  ?? "dev-user",
            role:        config.role,
            ...(config.email ? { email: config.email } : {}),
        };
    }

    buildLoginUrl(returnTo: string): string {
        assertRelative(returnTo);
        return `${this.loginUrl}?returnTo=${encodeURIComponent(returnTo)}`;
    }

    buildLogoutUrl(returnTo: string): string {
        assertRelative(returnTo);
        return `${this.logoutUrl}?returnTo=${encodeURIComponent(returnTo)}`;
    }

    async getSubject(_req: Request): Promise<Subject<Role>> {
        return { ...this._subject };
    }
}

function assertRelative(returnTo: string): void {
    if (sanitizeReturnTo(returnTo, "") !== returnTo) {
        throw new Error(`returnTo must be a same-site path, got: "${returnTo}"`);
    }
}
