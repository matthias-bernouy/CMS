/**
 * Two flavours of "set a state on a DOM element": class token or full attribute.
 * Factored to remove the if-class-vs-attr branching from every read/write.
 */
export type StateAttrOps = {
    apply(el: HTMLElement, value: string):     void;
    clear(el: HTMLElement, value: string):     void;
    isApplied(el: HTMLElement, value: string): boolean;
};

export function makeStateAttrOps(attrName: string): StateAttrOps {
    if (attrName === "class") return {
        apply:     (el, v) => el.classList.add(v),
        clear:     (el, v) => el.classList.remove(v),
        isApplied: (el, v) => el.classList.contains(v),
    };
    return {
        apply:     (el, v) => el.setAttribute(attrName, v),
        clear:     (el)    => el.removeAttribute(attrName),
        isApplied: (el, v) => el.getAttribute(attrName) === v,
    };
}
