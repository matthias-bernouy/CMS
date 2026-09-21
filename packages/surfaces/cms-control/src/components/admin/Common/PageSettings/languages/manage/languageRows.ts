import type { P9rInput } from "@bernouy/components";
import type { PathsDetailResponse } from "cms-control/api/_content/page/_routes/paths.get";
import type { PageSeoDetailResponse } from "cms-control/api/_content/page/_routes/seo.get";
import { languagePrefix } from "@bernouy/cms-content/page-path";
import { languageName } from "../languageName";

export type PathsDetail = PathsDetailResponse;
export type SeoDetail = PageSeoDetailResponse;

export function languageRows(
    language: PathsDetail["languages"][number],
    paths: PathsDetail,
    seo: SeoDetail,
    expanded: boolean,
): [HTMLTableRowElement, HTMLTableRowElement] {
    const row = document.createElement("tr");
    row.className = "page-language-row";
    const identity = document.createElement("td");
    identity.className = "page-language-identity";
    const heading = document.createElement("strong");
    const code = document.createElement("span");
    code.className = "page-language-code";
    code.textContent = language.code.toUpperCase();
    heading.append(code, document.createTextNode(languageName(language.code)));
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "page-language-toggle";
    toggle.textContent = expanded ? "Hide SEO" : "Edit SEO";
    toggle.setAttribute("aria-controls", `page-language-seo-${language.code}`);
    toggle.setAttribute("aria-expanded", String(expanded));
    identity.append(heading, toggle);

    const old = document.createElement("td");
    old.className = "page-language-old";
    old.dataset.label = "Current URL";
    const oldValue = document.createElement("span");
    oldValue.className = "page-language-old-value";
    oldValue.textContent = language.publicPath || "No URL yet";
    oldValue.toggleAttribute("data-empty", !language.publicPath);
    old.append(oldValue);

    const next = document.createElement("td");
    next.className = "page-language-next";
    next.dataset.label = "New URL";
    const input = document.createElement("p9r-input") as P9rInput;
    input.setAttribute("name", language.code);
    input.setAttribute("aria-label", `New URL for ${languageName(language.code)}`);
    input.setAttribute("value", paths.paths[language.code] ?? "");
    input.setAttribute("placeholder", "/your-page");
    input.setAttribute("autocomplete", "off");
    input.setAttribute("spellcheck", "false");
    input.required = language.default;
    if (!language.default) {
        input.setAttribute("prefix", languagePrefix(language.code));
    }
    if (!language.active) {
        input.setAttribute("hint", "Available after enabling this language in site settings.");
    }
    next.append(input);
    row.append(identity, old, next);

    const detailRow = document.createElement("tr");
    detailRow.id = `page-language-seo-${language.code}`;
    detailRow.className = "page-language-seo-row";
    detailRow.dataset.language = language.code;
    detailRow.hidden = !expanded;
    const cell = document.createElement("td");
    cell.colSpan = 3;
    const panel = document.createElement("div");
    panel.className = "page-language-seo-panel";
    panel.append(seoField("title", language.code, seo), seoField("description", language.code, seo));
    cell.append(panel);
    detailRow.append(cell);
    toggle.addEventListener("click", () => {
        detailRow.hidden = !detailRow.hidden;
        toggle.setAttribute("aria-expanded", String(!detailRow.hidden));
        toggle.textContent = detailRow.hidden ? "Edit SEO" : "Hide SEO";
    });
    return [row, detailRow];
}

function seoField(kind: "title" | "description", code: string, seo: SeoDetail): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "page-language-seo-field";
    const field = document.createElement(kind === "title" ? "p9r-input" : "p9r-textarea");
    field.setAttribute("name", `${code}.${kind}`);
    field.setAttribute("label", kind === "title" ? "SEO title" : "SEO description");
    field.setAttribute("aria-label", `SEO ${kind} for ${languageName(code)}`);
    field.setAttribute("value", seo.translations[code]?.[kind] ?? "");
    field.setAttribute("placeholder", seo.defaults[kind]);
    field.setAttribute("maxlength", kind === "title" ? "70" : "200");
    if (kind === "description") {
        field.setAttribute("rows", "3");
        field.setAttribute("max-count", "200");
    }
    wrap.append(field);
    return wrap;
}
