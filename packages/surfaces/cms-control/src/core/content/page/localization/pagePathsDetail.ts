import { localPagePath, publicPagePath } from "@bernouy/cms-content";
import type { ControlCms } from "cms-control/ControlCms";
import InvalidParam from "cms-control/core/admin/http/errors/InvalidParam";

export async function pagePathsDetail(cms: ControlCms, id: string) {
    const [page, system] = await Promise.all([cms.repository.getPageById(id), cms.repository.getSystem()]);
    if (!page) {
        throw new InvalidParam("id", "Unknown page id.");
    }
    const defaultLanguage = system.site.language;
    const languages = [...new Set([defaultLanguage, ...(system.site.additionalLanguages ?? [])].filter(Boolean))];
    const active = new Set([defaultLanguage, ...(system.site.activeLanguages ?? [])]);
    const paths =
        page.paths ??
        (defaultLanguage ? { [defaultLanguage]: localPagePath(defaultLanguage, page.path) ?? page.path } : {});
    return {
        id: page.id,
        paths,
        languages: languages.map((code) => ({
            code,
            active: active.has(code),
            default: code === defaultLanguage,
            publicPath: paths[code] ? publicPagePath(code, paths[code], defaultLanguage) : "",
        })),
    };
}
