import { parseHTML } from "linkedom";
import {
    CMS_BINDING_ATTRIBUTES,
    isCmsSourceMethod,
    isCmsSourceTrigger,
    parseQuery,
    parseQueryInput,
    parseSource,
    parseSourceBody,
    type CmsSourceBodyBinding,
    type CmsQueryInput,
    type CmsSourceMethod,
    type CmsSourceTrigger,
} from "cms-content/blocs/core/markup/bindings";

export type CmsSourceBindingReference = {
    url: string;
    alias?: string;
    method: CmsSourceMethod;
    trigger: CmsSourceTrigger;
    body?: CmsSourceBodyBinding;
};

export type CmsQueryBindingReference = {
    contractId: string;
    capabilityId: string;
    alias: string;
    input?: CmsQueryInput;
};

/** Extract direct logical query targets without resolving any Provider transport binding. */
export function collectCmsQueryBindings(html: string): CmsQueryBindingReference[] {
    const { document } = parseHTML(html);
    const bindings: CmsQueryBindingReference[] = [];
    for (const element of Array.from(document.querySelectorAll(`[${CMS_BINDING_ATTRIBUTES.query}]`))) {
        const query = parseQuery(element.getAttribute(CMS_BINDING_ATTRIBUTES.query) ?? "");
        if (query && "contractId" in query) {
            const input = parseQueryInput(element.getAttribute(CMS_BINDING_ATTRIBUTES.queryInput));
            bindings.push({
                contractId: query.contractId,
                capabilityId: query.capabilityId,
                alias: query.name,
                ...(input ? { input } : {}),
            });
        }
    }
    return bindings;
}

/**
 * Extract authored `cms-source` references from a stored HTML fragment.
 * This is intentionally content-only: callers decide whether a source URL is
 * executable in their surface and how to authorize it.
 */
export function collectCmsSourceBindings(html: string): CmsSourceBindingReference[] {
    const { document } = parseHTML(html);
    const bindings: CmsSourceBindingReference[] = [];

    for (const element of Array.from(document.querySelectorAll(`form[${CMS_BINDING_ATTRIBUTES.source}]`))) {
        const source = parseSource(element.getAttribute(CMS_BINDING_ATTRIBUTES.source) ?? "");
        if (!source) {
            continue;
        }

        const alias = source.alias?.trim();
        const body = parseSourceBody(element.getAttribute(CMS_BINDING_ATTRIBUTES.sourceBody));
        bindings.push({
            url: source.url,
            ...(alias ? { alias } : {}),
            method: sourceMethod(element.getAttribute(CMS_BINDING_ATTRIBUTES.sourceMethod)),
            trigger: sourceTrigger(element.getAttribute(CMS_BINDING_ATTRIBUTES.sourceTrigger)),
            ...(body ? { body } : {}),
        });
    }

    return bindings;
}

function sourceMethod(value: string | null): CmsSourceMethod {
    const method = (value ?? "").trim().toUpperCase();
    return isCmsSourceMethod(method) ? method : "POST";
}

function sourceTrigger(value: string | null): CmsSourceTrigger {
    const trigger = (value ?? "").trim().toLowerCase();
    return isCmsSourceTrigger(trigger) ? trigger : "submit";
}
