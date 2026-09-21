import { isValidPathFormat } from "@bernouy/cms-content/page-path";
import type { P9rInput, Textarea } from "@bernouy/components";
import { languageRows, type PathsDetail, type SeoDetail } from "./languageRows";

type Translation = { title?: string; description?: string };

export function createLanguagesForm(paths: PathsDetail, seo: SeoDetail, expanded: Set<string>, saved: boolean) {
    const form = document.createElement("form");
    form.className = "page-languages-form";
    const intro = document.createElement("p");
    intro.className = "page-languages-intro";
    intro.textContent = "Changed URLs redirect permanently. Empty SEO fields use the page title and description.";
    const scroll = document.createElement("div");
    scroll.className = "page-languages-scroll";
    const table = document.createElement("table");
    table.className = "page-languages-table";
    const head = document.createElement("thead");
    const headingRow = document.createElement("tr");
    for (const label of ["Language", "Current URL", "New URL"]) {
        const heading = document.createElement("th");
        heading.scope = "col";
        heading.textContent = label;
        headingRow.append(heading);
    }
    head.append(headingRow);
    const body = document.createElement("tbody");
    for (const language of paths.languages) {
        body.append(...languageRows(language, paths, seo, expanded.has(language.code)));
    }
    table.append(head, body);
    scroll.append(table);
    const footer = document.createElement("div");
    footer.className = "page-languages-footer";
    const feedback = document.createElement("div");
    const message = document.createElement("p");
    message.className = "page-languages-error";
    message.setAttribute("role", "alert");
    const status = document.createElement("p");
    status.className = "page-languages-status";
    status.setAttribute("role", "status");
    status.textContent = saved ? "Language changes saved." : "";
    feedback.append(message, status);
    const save = document.createElement("p9r-button");
    save.setAttribute("type", "submit");
    save.setAttribute("color", "primary");
    save.setAttribute("disabled", "");
    save.textContent = "Save changes";
    footer.append(feedback, save);
    form.append(intro, scroll, footer);
    form.addEventListener("input", (event) => {
        const target = event.target;
        if (target instanceof HTMLElement && target.matches(".page-language-row p9r-input")) {
            const input = target as P9rInput;
            setPathError(input, pathInputError(input));
        }
        message.textContent = "";
        status.textContent = "";
        save.toggleAttribute("disabled", !hasChanges(paths, seo, form));
    });
    return { form, message, save };
}

export function pathInputs(form: HTMLFormElement): P9rInput[] {
    return Array.from(form.querySelectorAll<P9rInput>(".page-language-row p9r-input"));
}

export function setPathError(input: P9rInput, text: string): void {
    if (text) {
        input.setAttribute("error", text);
    } else {
        input.removeAttribute("error");
    }
}

export function pathInputError(input: P9rInput): string {
    if (!input.value) {
        return "";
    }
    if (!isValidPathFormat(input.value)) {
        return "Use a path like /about-us.";
    }
    return "";
}

export function readTranslations(form: HTMLFormElement): Record<string, Translation> {
    const translations: Record<string, Translation> = {};
    for (const row of Array.from(form.querySelectorAll<HTMLElement>(".page-language-seo-row"))) {
        const code = row.dataset.language!;
        const title = row.querySelector<P9rInput>("p9r-input")!.value.trim();
        const description = row.querySelector<Textarea>("p9r-textarea")!.value.trim();
        if (title || description) {
            translations[code] = { ...(title ? { title } : {}), ...(description ? { description } : {}) };
        }
    }
    return translations;
}

export function hasPathChanges(paths: PathsDetail, form: HTMLFormElement): boolean {
    return pathInputs(form).some((input) => input.value !== (paths.paths[input.name] ?? ""));
}

export function hasChanges(paths: PathsDetail, seo: SeoDetail, form: HTMLFormElement): boolean {
    if (hasPathChanges(paths, form)) {
        return true;
    }
    const draft = readTranslations(form);
    return seo.languages.some((code) => {
        const before = seo.translations[code] ?? {};
        const after = draft[code] ?? {};
        return (before.title ?? "") !== (after.title ?? "") || (before.description ?? "") !== (after.description ?? "");
    });
}

export function applySeoDefaults(root: HTMLElement, seo: SeoDetail, title: string, description: string): void {
    seo.defaults = { title, description };
    for (const field of Array.from(root.querySelectorAll<HTMLElement>(".page-language-seo-field"))) {
        const input = field.querySelector<HTMLElement & { value: string }>("p9r-input, p9r-textarea");
        const kind = input?.getAttribute("name")?.split(".")[1] as "title" | "description" | undefined;
        if (input && kind) {
            input.setAttribute("placeholder", seo.defaults[kind]);
        }
    }
}

export function updateCurrentUrls(form: HTMLFormElement, paths: PathsDetail): void {
    for (const language of paths.languages) {
        const row = Array.from(form.querySelectorAll<HTMLElement>(".page-language-row")).find((item) =>
            item.querySelector(`p9r-input[name="${language.code}"]`),
        );
        const current = row?.querySelector<HTMLElement>(".page-language-old-value");
        if (current) {
            current.textContent = language.publicPath || "No URL yet";
            current.toggleAttribute("data-empty", !language.publicPath);
        }
    }
}
