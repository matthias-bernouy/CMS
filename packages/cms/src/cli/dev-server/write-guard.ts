type BlockRule = { method: string; pattern: RegExp; label: string };

/**
 * Routes that would mutate the remote CMS. In `p9r dev` these are blocked with
 * a 403 so the local editor can never corrupt prod content.
 *
 * `POST /api/page` is deliberately absent: it's intercepted earlier in the
 * server and routed to `scratch.json` instead of hitting the guard.
 */
const BLOCKED: BlockRule[] = [
    { method: "POST",   pattern: /\/api\/template$/,  label: "template write" },
    { method: "PUT",    pattern: /\/api\/template$/,  label: "template update" },
    { method: "DELETE", pattern: /\/api\/template$/,  label: "template delete" },
    { method: "POST",   pattern: /\/api\/snippet$/,   label: "snippet write" },
    { method: "PUT",    pattern: /\/api\/snippet$/,   label: "snippet update" },
    { method: "DELETE", pattern: /\/api\/snippet$/,   label: "snippet delete" },
    { method: "POST",   pattern: /\/api\/system$/,    label: "system write" },
    { method: "POST",   pattern: /\/api\/bloc$/,      label: "bloc upload" },
    { method: "POST",   pattern: /\/api\/media\//,    label: "media write" },
    { method: "PATCH",  pattern: /\/api\/media\//,    label: "media patch" },
    { method: "DELETE", pattern: /\/api\/media\//,    label: "media delete" },
];

export function findBlockingRule(method: string, path: string): BlockRule | null {
    return BLOCKED.find(r => r.method === method && r.pattern.test(path)) ?? null;
}

export function blockedResponse(rule: BlockRule, path: string): Response {
    const body = JSON.stringify({
        error: "Disabled in dev mode",
        reason: rule.label,
        method: rule.method,
        path,
        hint: "`p9r dev` runs in read-only mode. Writes are blocked to protect the remote CMS.",
    });
    return new Response(body, {
        status: 403,
        headers: { "Content-Type": "application/json" },
    });
}
