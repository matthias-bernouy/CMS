import type { ControlCms } from "cms-control/ControlCms";
import { pageSeoForLanguage } from "@bernouy/cms-content";
import InvalidParam from "cms-control/core/admin/http/errors/InvalidParam";

export async function pageSeoDetail(cms: ControlCms, id: string) {
    const [page, system] = await Promise.all([cms.repository.getPageById(id), cms.repository.getSystem()]);
    if (!page) {
        throw new InvalidParam("id", "Unknown page id.");
    }
    const languages = [...new Set([system.site.language, ...(system.site.additionalLanguages ?? [])].filter(Boolean))];
    return {
        id: page.id,
        revision: page.revision,
        defaults: { title: page.title, description: page.description },
        languages,
        translations: Object.fromEntries(languages.map((code) => [code, pageSeoForLanguage(page, code) ?? {}])),
    };
}
