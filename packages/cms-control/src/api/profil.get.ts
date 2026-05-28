import type { ControlCms } from "src/control/ControlCms";

export type ProfilResponse = {
    logoutUrl: string;
};

/**
 * `GET /api/profil` — bundles every URL the admin Profile page needs.
 * Keeps the page itself a static `<cms-fetch>` consumer with no
 * server-side substitution: the page templates `{{ logoutUrl }}` from
 * this response.
 *
 * `logoutUrl` is built via `cms.auth.buildLogoutUrl(returnTo)` so the
 * provider stays in charge of session destruction; the browser is just
 * told where to navigate. Access tokens have their own panel
 * (`<cms-tokens>` → `/api/pats`), so no token URL is bundled here.
 */
export default async function profil(_req: Request, cms: ControlCms): Promise<Response> {
    const returnTo = cms.basePath || "/";
    const data: ProfilResponse = {
        logoutUrl: cms.auth.buildLogoutUrl(returnTo),
    };
    return new Response(JSON.stringify(data), {
        headers: { "Content-Type": "application/json" },
    });
}
