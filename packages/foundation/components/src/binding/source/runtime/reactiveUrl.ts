import {
    hasParamTokens,
    hasStateTokens,
    PARAMS_CHANGE_EVENT,
    resolveParams,
    resolveState,
    STATE_CHANGE_EVENT,
} from "../../params";

export function resolveReactiveUrl(template: string, doc: Document): string {
    return resolveState(resolveParams(template), doc);
}

export function listenReactiveUrlChanges(template: string, doc: Document, onChange: () => void): () => void {
    const listensParams = hasParamTokens(template);
    const listensState = hasStateTokens(template);
    if (listensParams) {
        doc.addEventListener(PARAMS_CHANGE_EVENT, onChange);
        doc.defaultView?.addEventListener?.("popstate", onChange);
    }
    if (listensState) {
        doc.addEventListener(STATE_CHANGE_EVENT, onChange);
    }

    return () => {
        if (listensParams) {
            doc.removeEventListener(PARAMS_CHANGE_EVENT, onChange);
            doc.defaultView?.removeEventListener?.("popstate", onChange);
        }
        if (listensState) {
            doc.removeEventListener(STATE_CHANGE_EVENT, onChange);
        }
    };
}
