import { validatePageSeo } from "@bernouy/cms-content";
import type { ControlCms } from "cms-control/ControlCms";
import InvalidParam from "cms-control/core/admin/http/errors/InvalidParam";
import { invalidateUpdatedPage } from "cms-control/core/admin/server/cache/invalidation";
import { pageSeoDetail } from "cms-control/core/content/page/localization/pageSeoDetail";

export async function updatePageSeo(cms: ControlCms, id: string, body: Record<string, unknown>) {
    const translations = body.translations;
    if (!translations || typeof translations !== "object" || Array.isArray(translations)) {
        throw new InvalidParam("translations", "Expected a language-to-SEO object.");
    }
    const [page, system] = await Promise.all([cms.repository.getPageById(id), cms.repository.getSystem()]);
    if (!page) {
        throw new InvalidParam("id", "Unknown page id.");
    }
    const normalized = validatePageSeo(translations);
    const allowed = new Set(
        [system.site.language, ...(system.site.additionalLanguages ?? [])].map((code) => code.toLowerCase()),
    );
    for (const code of Object.keys(normalized)) {
        if (!allowed.has(code.toLowerCase())) {
            throw new InvalidParam("translations", `Language ${code} is not configured for this site.`);
        }
    }
    await cms.repository.updatePage({ id, seo: normalized });
    await invalidateUpdatedPage(cms, page, system.site.language);
    return pageSeoDetail(cms, id);
}
