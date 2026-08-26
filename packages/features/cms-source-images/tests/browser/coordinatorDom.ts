import { parseHTML } from "linkedom";

const dom = parseHTML(`
    <!doctype html>
    <html>
        <head><base href="http://localhost/"></head>
        <body></body>
    </html>
`);

Object.assign(globalThis, {
    window: dom.window,
    document: dom.document,
    customElements: dom.customElements,
    Element: dom.Element,
    HTMLElement: dom.HTMLElement,
    Event: dom.Event,
    MutationObserver: dom.MutationObserver,
    Node: dom.Node,
});
