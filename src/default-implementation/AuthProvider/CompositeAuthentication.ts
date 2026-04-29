import type { Authentication, DefaultRole, Subject } from "../../interfaces/Authentication";
import type { Runner } from "../../interfaces/Runner";
import { escapeHtml, htmlResponse } from "../../utilities/html";

export type CompositeChild<Role extends string = DefaultRole> = {
    auth: Authentication<Role>;

    /**
     * Label shown on the login chooser page. When omitted, the child is
     * still consulted by `getSubject` (useful for bearer-only providers
     * like `TokenAuthentication`) but never appears as a clickable option.
     */
    displayName?: string;
};

export type CompositeAuthenticationConfig<Role extends string = DefaultRole> = {
    /**
     * Providers queried, in order, by `getSubject`. First non-null wins.
     * Put bearer providers first to short-circuit cookie lookup for API
     * clients.
     */
    children: CompositeChild<Role>[];

    /**
     * Path prefix under which the chooser route is mounted (only when
     * there are 2+ browser-loginable children). Defaults to `/auth`.
     */
    basePath?: string;

    /**
     * Index of the child that provides `profileUrl` and `logoutUrl`. The
     * composite has no profile of its own; it delegates to this child.
     * Defaults to the first child with a `displayName` (the "primary"
     * browser provider).
     */
    profileChild?: number;
};

/**
 * Aggregates multiple `Authentication<Role>` providers behind a single
 * handle. `getSubject` walks children in order, returning the first
 * resolved Subject. Login redirects to a chooser page when more than one
 * browser-loginable child is configured; otherwise it delegates directly.
 *
 * The composite only implements `Authentication<Role>` — children handle
 * their own callbacks. If any child is an `AuthenticationConsumer`, its
 * callback routes are registered by the child itself, not by the composite.
 */
export class CompositeAuthentication<Role extends string = DefaultRole> implements Authentication<Role> {

    readonly loginUrl: string;
    readonly logoutUrl: string;
    readonly profileUrl: string;

    private readonly _children: CompositeChild<Role>[];
    private readonly _browserChildren: CompositeChild<Role>[];
    private readonly _basePath: string;

    constructor(runner: Runner, config: CompositeAuthenticationConfig<Role>) {
        if (config.children.length === 0) {
            throw new Error("CompositeAuthentication: children must not be empty.");
        }
        this._children = config.children;
        this._browserChildren = config.children.filter((c) => c.displayName !== undefined);
        this._basePath = stripTrailingSlash(config.basePath ?? "/auth");

        if (this._browserChildren.length === 0) {
            throw new Error(
                "CompositeAuthentication: at least one child must carry a `displayName` " +
                "so users have a way to log in via the browser.",
            );
        }

        const profileIdx = config.profileChild ?? this._children.indexOf(this._browserChildren[0]!);
        const profileChild = this._children[profileIdx];
        if (!profileChild) {
            throw new Error(`CompositeAuthentication: profileChild index ${profileIdx} out of bounds.`);
        }
        this.profileUrl = profileChild.auth.profileUrl;
        this.logoutUrl = profileChild.auth.logoutUrl;

        if (this._browserChildren.length === 1) {
            // Short-circuit: no chooser page needed, the single provider owns login.
            this.loginUrl = this._browserChildren[0]!.auth.loginUrl;
        } else {
            this.loginUrl = `${this._basePath}/login`;
            runner.get(`${this._basePath}/login`, (req) => this._renderChooser(req));
        }
    }

    buildLoginUrl(returnTo: string): string {
        if (this._browserChildren.length === 1) {
            return this._browserChildren[0]!.auth.buildLoginUrl(returnTo);
        }
        return `${this.loginUrl}?returnTo=${encodeURIComponent(returnTo)}`;
    }

    buildLogoutUrl(returnTo: string): string {
        // Delegated to the profile child — bearer providers don't have a
        // meaningful logout, so we route users to the cookie provider that
        // actually needs to clear state.
        const idx = this._children.findIndex((c) => c.auth.logoutUrl === this.logoutUrl);
        const target = idx >= 0 ? this._children[idx]! : this._children[0]!;
        return target.auth.buildLogoutUrl(returnTo);
    }

    async getSubject(req: Request): Promise<Subject<Role> | null> {
        for (const child of this._children) {
            const subject = await child.auth.getSubject(req);
            if (subject) return subject;
        }
        return null;
    }

    // ── chooser page ─────────────────────────────────────────────────────

    private async _renderChooser(req: Request): Promise<Response> {
        const url = new URL(req.url);
        const returnTo = sanitizeReturnTo(url.searchParams.get("returnTo") ?? "", "/");

        const buttons = this._browserChildren
            .map((c) => {
                const target = c.auth.buildLoginUrl(returnTo);
                return `<li><a href="${escapeHtml(target)}"><button type="button" class="primary">${escapeHtml(c.displayName!)}</button></a></li>`;
            })
            .join("");

        return htmlResponse(`<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>Connexion</title>
<style>
    body { font-family: system-ui, sans-serif; max-width: 420px; margin: 4rem auto; padding: 0 1rem; text-align: center; color: #1a1a1a; }
    h1 { margin-bottom: 1.5rem; }
    ul { list-style: none; padding: 0; }
    li { margin: 0.5rem 0; }
    button { padding: 0.6rem 1.2rem; cursor: pointer; border: 1px solid #ccc; background: #fff; border-radius: 4px; font-size: 1rem; min-width: 220px; }
    button.primary { background: #2563eb; color: #fff; border-color: #2563eb; }
    a { text-decoration: none; }
</style>
</head>
<body>
<h1>Connexion</h1>
<p>Choisis un mode de connexion :</p>
<ul>${buttons}</ul>
</body>
</html>`);
    }
}

// ── helpers ──────────────────────────────────────────────────────────────

function stripTrailingSlash(s: string): string {
    return s.length > 1 && s.endsWith("/") ? s.slice(0, -1) : s;
}

/**
 * Same open-redirect rules as the Keycloak consumer: only accept paths
 * starting with a single `/`, reject protocol-relative `//evil.com`.
 */
function sanitizeReturnTo(candidate: string, fallback: string): string {
    if (!candidate) return fallback;
    if (!candidate.startsWith("/")) return fallback;
    if (candidate.startsWith("//")) return fallback;
    return candidate;
}
