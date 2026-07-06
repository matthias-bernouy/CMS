import { parseHTML } from "linkedom";
import {
    CMS_BINDING_ATTRIBUTES,
    isCmsSourceMethod,
    isCmsSourceTrigger,
    parseSource,
    type CmsSourceMethod,
    type CmsSourceTrigger,
} from "cms-content/interfaces/Editor/BindingSyntax";

export type CmsSourceBindingReference = {
    url: string;
    alias?: string;
    method: CmsSourceMethod;
    trigger: CmsSourceTrigger;
};

/**
 * Extract authored `cms-source` references from a stored HTML fragment.
 * This is intentionally content-only: callers decide whether a source URL is
 * executable in their surface and how to authorize it.
 */
export function collectCmsSourceBindings(html: string): CmsSourceBindingReference[] {
    const { document } = parseHTML(html);
    const bindings: CmsSourceBindingReference[] = [];

    for (const element of Array.from(document.querySelectorAll(`[${CMS_BINDING_ATTRIBUTES.source}]`))) {
        const source = parseSource(element.getAttribute(CMS_BINDING_ATTRIBUTES.source) ?? "");
        if (!source) continue;

        const alias = source.alias?.trim();
        bindings.push({
            url: source.url,
            ...(alias ? { alias } : {}),
            method: sourceMethod(element.getAttribute(CMS_BINDING_ATTRIBUTES.sourceMethod)),
            trigger: sourceTrigger(element.getAttribute(CMS_BINDING_ATTRIBUTES.sourceTrigger)),
        });
    }

    return bindings;
}

function sourceMethod(value: string | null): CmsSourceMethod {
    const method = (value ?? "").trim().toUpperCase();
    return isCmsSourceMethod(method) ? method : "GET";
}

function sourceTrigger(value: string | null): CmsSourceTrigger {
    const trigger = (value ?? "").trim().toLowerCase();
    return isCmsSourceTrigger(trigger) ? trigger : "auto";
}
