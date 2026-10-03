import {
    hasChanges,
    hasPathChanges,
    pathInputError,
    pathInputs,
    readTranslations,
    setPathError,
} from "./PageLanguagesView";
import type { PathsDetail, SeoDetail } from "./languageRows";

export async function saveLanguages(
    form: HTMLFormElement,
    paths: PathsDetail,
    seo: SeoDetail,
    basePath: string,
    isCurrent: () => boolean,
    onPathsSaved: (updated: PathsDetail) => void,
): Promise<SeoDetail> {
    const inputs = pathInputs(form);
    for (const input of inputs) {
        const error = pathInputError(input);
        if (error) {
            setPathError(input, error);
            input.focus();
            throw new Error("Fix the highlighted URL before saving.");
        }
    }
    if (hasPathChanges(paths, form)) {
        const changed = inputs.filter((input) => input.value && input.value !== (paths.paths[input.name] ?? ""));
        const availability = await Promise.all(
            changed.map(async (input) => {
                const url = new URL(`${basePath}/api/page/exists`, document.baseURI);
                url.searchParams.set("path", input.value);
                url.searchParams.set("language", input.name);
                url.searchParams.set("pageId", paths.id);
                try {
                    const response = await fetch(url);
                    return { input, available: response.ok && !(await response.json()).exists };
                } catch {
                    return { input, available: false };
                }
            }),
        );
        const unavailable = availability.find((result) => !result.available);
        if (unavailable) {
            setPathError(unavailable.input, "This URL is already reserved or could not be checked.");
            throw new Error("Fix the highlighted URL before saving.");
        }
        if (!isCurrent()) {
            return seo;
        }
        const nextPaths = Object.fromEntries(inputs.map((input) => [input.name, input.value]));
        const response = await fetch(`${basePath}/api/page/paths?id=${encodeURIComponent(paths.id)}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ paths: nextPaths, expectedPaths: paths.paths, revision: paths.revision }),
        });
        if (!response.ok) {
            if (response.status === 409) {
                const body = (await response.json().catch(() => null)) as { code?: string } | null;
                if (body?.code === "page_path_update_in_progress" || body?.code === "page_paths_changed") {
                    throw new Error("Page URLs changed elsewhere. Reopen Languages before saving.");
                }
                throw new Error("A URL is already reserved.");
            }
            throw new Error("Could not save page URLs.");
        }
        const updated = (await response.json()) as PathsDetail;
        onPathsSaved(updated);
        if (!isCurrent()) {
            return seo;
        }
        Object.assign(paths, updated);
    }
    if (!isCurrent()) {
        return seo;
    }
    if (!hasChanges(paths, seo, form)) {
        return seo;
    }
    const response = await fetch(`${basePath}/api/page/seo?id=${encodeURIComponent(seo.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ translations: readTranslations(form), revision: paths.revision }),
    });
    if (!response.ok) {
        throw new Error("Could not save SEO translations.");
    }
    return (await response.json()) as SeoDetail;
}
