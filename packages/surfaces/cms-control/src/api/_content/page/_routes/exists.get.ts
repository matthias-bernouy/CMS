import { publicPagePath } from "@bernouy/cms-content";
import { isReservedPublicPagePath } from "@bernouy/cms-content/page-path";
import type { ControlCms } from "cms-control/ControlCms";

/** Check the indexed route registry before the path editor submits a change. */
export default async function pageExists(req: Request, cms: ControlCms) {
    const url = new URL(req.url);
    const path = url.searchParams.get("path");
    if (!path) {
        return new Response("Missing argument `path`", { status: 400 });
    }

    const pageId = url.searchParams.get("pageId");
    const system = await cms.repository.getSystem();
    const defaultLanguage = system.site.language;
    const language = url.searchParams.get("language") ?? defaultLanguage;
    const candidate = publicPagePath(language, path, defaultLanguage);
    if (isReservedPublicPagePath(candidate, [defaultLanguage, ...(system.site.additionalLanguages ?? [])])) {
        return json({ exists: true, reason: "reserved" });
    }

    const route = await cms.repository.getPageRoute?.(candidate);
    if (route) {
        return route.pageId === pageId &&
            (route.state === "current" || (route.state === "redirect" && route.ownerPageId === pageId))
            ? json({ exists: false })
            : json({ exists: true, reason: route.state });
    }
    const match = await cms.repository.getPage(candidate);
    if (match !== null && match.id !== pageId) {
        return json({ exists: true, reason: "current" });
    }
    return json({ exists: false });
}

function json(body: unknown): Response {
    return new Response(JSON.stringify(body), {
        headers: { "Content-Type": "application/json" },
    });
}
