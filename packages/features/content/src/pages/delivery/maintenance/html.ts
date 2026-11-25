import { parseHTML } from "linkedom";

/** Keep layout markers while removing scripts, active forms and live bindings. */
export function freezeMaintenanceHtml(
    html: string,
    base: URL,
    rewrite: (value: string, from: URL) => string,
    css: (value: string, from: URL) => string,
): string {
    const { document } = parseHTML(html);
    for (const element of document.querySelectorAll(
        'script,iframe,object,embed,base,meta[http-equiv],link[rel="preload"],link[rel="modulepreload"],link[rel="prefetch"],link[rel="canonical"],#cms-binding-cloak',
    )) {
        element.remove();
    }
    for (const element of document.querySelectorAll("form,input,button,select,textarea")) {
        element.setAttribute("inert", "");
        element.setAttribute("disabled", "");
    }
    for (const element of document.querySelectorAll("*")) {
        for (const attribute of [...element.attributes]) {
            if (
                attribute.name.startsWith("on") ||
                attribute.name.startsWith("cms-query") ||
                attribute.name.startsWith("cms-mutation")
            ) {
                element.removeAttribute(attribute.name);
            }
        }
        for (const name of ["src", "poster", "srcset", "href", "xlink:href"]) {
            const value = element.getAttribute(name);
            if (!value || (name === "href" && !["LINK", "IMAGE", "USE"].includes(element.tagName.toUpperCase()))) {
                continue;
            }
            const result = name === "srcset" ? rewriteSrcset(value, (url) => rewrite(url, base)) : rewrite(value, base);
            element.setAttribute(name, result);
        }
        if (element.hasAttribute("style")) {
            element.setAttribute("style", css(element.getAttribute("style")!, base));
        }
    }
    for (const style of document.querySelectorAll("style")) {
        style.textContent = css(style.textContent ?? "", base);
    }
    const robots = document.createElement("meta");
    robots.setAttribute("name", "robots");
    robots.setAttribute("content", "noindex, nofollow");
    document.head.appendChild(robots);
    const layout = document.createElement("style");
    layout.textContent = "cms-binding-core{display:contents}";
    document.head.appendChild(layout);
    return document.toString();
}

function rewriteSrcset(value: string, rewrite: (url: string) => string): string {
    const candidates: string[] = [];
    let rest = value;
    while (rest.trim()) {
        rest = rest.replace(/^[\s,]+/u, "");
        const token = /^\S+/u.exec(rest)?.[0];
        if (!token) {
            break;
        }
        rest = rest.slice(token.length);
        const url = token.replace(/,+$/u, "");
        const descriptors = token.endsWith(",") ? "" : (rest.split(",", 1)[0] ?? "");
        rest = rest.slice(descriptors.length);
        candidates.push(rewrite(url) + descriptors);
    }
    return candidates.join(", ");
}
