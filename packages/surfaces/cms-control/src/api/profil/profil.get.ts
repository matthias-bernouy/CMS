import type { ControlCms } from "cms-control/ControlCms";
import MissingParam from "cms-control/errors/Http/MissingParam";

export type ProfilResponse = {
    logoutUrl:    string;
    email:        string;
    role:         string;
    roleLabel:    string;
    provider:     string;
    /** Single-element array when the account can self-change its password (the
     *  builtin `local` email/password provider), empty otherwise. Drives the
     *  conditional render of the password card via `<template for>` — the
     *  fetch template engine has no `if`, only array iteration. */
    passwordCard: Record<string, never>[];
};

/**
 * `GET /api/profil` — the current user's own profile, for the admin Profile
 * page. Identity comes from the session (`getSubject`); the editable/displayed
 * fields come from the membership store (`users.getBySub`). Falls back to the
 * subject when the membership row is absent (e.g. the dev in-memory auth, whose
 * subject id may not be a stored user).
 */
export default async function profil(req: Request, cms: ControlCms): Promise<Response> {
    const subject = await cms.auth.getSubject(req);
    if (!subject) throw new MissingParam("session");

    const user     = await cms.users.getBySub(subject.identifier);
    const provider = user?.provider ?? "";
    const role     = user?.role ?? subject.role;
    const returnTo = cms.basePath || "/";

    const data: ProfilResponse = {
        logoutUrl:    cms.auth.buildLogoutUrl(returnTo),
        email:        user?.email ?? subject.email ?? "",
        role,
        roleLabel:    role.charAt(0).toUpperCase() + role.slice(1),
        provider,
        passwordCard: provider === "local" ? [{}] : [],
    };
    return new Response(JSON.stringify(data), {
        headers: { "Content-Type": "application/json" },
    });
}
