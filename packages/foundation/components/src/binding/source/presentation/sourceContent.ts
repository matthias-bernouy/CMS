/**
 * Captures a `cms-source` authored body once, then leaves the element empty so
 * the runtime can mount reactive regions into it.
 */

export type CapturedSourceContent = {
    /** Authored editable template, kept raw for editor deactivation. */
    template: DocumentFragment;
    /** Default data template, compiled by the reactive runtime. */
    body: DocumentFragment;
};

export function captureSourceContent(el: Element): CapturedSourceContent {
    const doc = el.ownerDocument ?? document;
    const body = doc.createDocumentFragment();
    const template = doc.createDocumentFragment();

    for (const child of Array.from(el.childNodes)) {
        if (child.nodeType === Node.ELEMENT_NODE && (child as Element).tagName === "TEMPLATE") {
            template.appendChild(child.cloneNode(true));
            body.appendChild((child as HTMLTemplateElement).content);
            (child as Element).remove();
        } else {
            body.appendChild(child);
            // Moving a live custom-element subtree disconnects it first. Clone
            // afterwards so editor-facing teardown hooks can restore authored
            // content before the raw template is captured.
            template.appendChild(child.cloneNode(true));
        }
    }

    return { template, body };
}

export function cloneSourceContent(el: Element): CapturedSourceContent {
    const doc = el.ownerDocument ?? document;
    const body = doc.createDocumentFragment();
    const template = doc.createDocumentFragment();

    for (const child of Array.from(el.childNodes)) {
        template.appendChild(child.cloneNode(true));
        if (child.nodeType === Node.ELEMENT_NODE && (child as Element).tagName === "TEMPLATE") {
            body.appendChild((child as HTMLTemplateElement).content.cloneNode(true));
        } else {
            body.appendChild(child.cloneNode(true));
        }
    }

    return { template, body };
}

export function isEmpty(data: unknown): boolean {
    if (data == null) {
        return true;
    }
    if (Array.isArray(data)) {
        return data.length === 0;
    }
    if (typeof data === "object") {
        return Object.keys(data as object).length === 0;
    }
    return false;
}
