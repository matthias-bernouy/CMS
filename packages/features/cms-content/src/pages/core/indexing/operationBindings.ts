import { parseHTML } from "linkedom";
import {
    CMS_BINDING_ATTRIBUTES,
    parseMutation,
    parseQuery,
    parseQueryInput,
    type CmsMutationInput,
    type CmsQueryInput,
} from "cms-content/blocs/core/markup/bindings";

export type CmsQueryBindingReference = {
    readonly contractId: string;
    readonly capabilityId: string;
    readonly alias: string;
    readonly input?: CmsQueryInput;
};

export type CmsMutationBindingReference = {
    readonly contractId: string;
    readonly capabilityId: string;
    readonly alias: string;
    readonly input?: CmsMutationInput;
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

/** Extract direct logical mutation targets without resolving any Provider transport binding. */
export function collectCmsMutationBindings(html: string): CmsMutationBindingReference[] {
    const { document } = parseHTML(html);
    const bindings: CmsMutationBindingReference[] = [];
    for (const element of Array.from(document.querySelectorAll(`form[${CMS_BINDING_ATTRIBUTES.mutation}]`))) {
        const mutation = parseMutation(element.getAttribute(CMS_BINDING_ATTRIBUTES.mutation) ?? "");
        if (!mutation || mutation.contractId.startsWith("kernel.")) {
            continue;
        }
        const input = parseQueryInput(element.getAttribute(CMS_BINDING_ATTRIBUTES.mutationInput));
        bindings.push({
            contractId: mutation.contractId,
            capabilityId: mutation.capabilityId,
            alias: mutation.name,
            ...(input ? { input } : {}),
        });
    }
    return bindings;
}
