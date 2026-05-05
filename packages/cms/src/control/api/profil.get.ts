import type { ControlCms } from "src/control/ControlCms";

export type ProfilResponse = {
    logoutUrl: string;
    tokensUrl: string;
};

/**
 * `GET /api/profil` — bundles every URL the admin Profile page needs.
 * Keeps the page itself a static `<cms-fetch>` consumer with no
 * server-side substitution: the page templates `{{ logoutUrl }}` and
 * `{{ tokensUrl }}` from this response.
 *
 * `logoutUrl` is built via `cms.auth.buildLogoutUrl(returnTo)` so the
 * provider stays in charge of session destruction; the browser is just
 * told where to navigate.
 */
export default async function profil(_req: Request, cms: ControlCms): Promise<Response> {
    const returnTo = cms.basePath || "/";
    const data: ProfilResponse = {
        logoutUrl: cms.auth.buildLogoutUrl(returnTo),
        tokensUrl: cms.config.tokensUrl,
    };
    return new Response(JSON.stringify(data), {
        headers: { "Content-Type": "application/json" },
    });
}
