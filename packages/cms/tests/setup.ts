import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { P9R_ATTR } from "src/socle/constants/editorAttributes";
import { P9R_CACHE, P9R_EVENT, P9R_ID, P9R_MODE } from "src/socle/constants/p9r-constants";

// Save Bun's network primitives before happy-dom replaces them. Happy-dom's
// Response auto-decodes bodies based on Content-Encoding, which breaks tests
// that assert pre-compressed byte payloads. We keep happy-dom's DOM but fall
// back to Bun's Response/Request/Headers/fetch for server-side tests.
const BunResponse = globalThis.Response;
const BunRequest = globalThis.Request;
const BunHeaders = globalThis.Headers;
const BunFetch = globalThis.fetch;
const BunFormData = globalThis.FormData;
const BunFile = globalThis.File;
const BunBlob = globalThis.Blob;

GlobalRegistrator.register({
    url: "http://localhost:4999/cms/admin/editor",
});

// happy-dom does not implement `attachInternals()` yet. Several w13c inputs
// rely on `formAssociated = true` and call `attachInternals()` in their
// constructor — polyfill a no-op stub so they can be instantiated in tests.
if (!(HTMLElement.prototype as any).attachInternals) {
    (HTMLElement.prototype as any).attachInternals = function () {
        return {
            setFormValue: () => {},
            setValidity: () => {},
            states: { add: () => {}, delete: () => {}, has: () => false },
            form: null,
            labels: [],
        };
    };
}

(globalThis as any).Response = BunResponse;
(globalThis as any).Request = BunRequest;
(globalThis as any).Headers = BunHeaders;
(globalThis as any).fetch = BunFetch;
(globalThis as any).FormData = BunFormData;
(globalThis as any).File = BunFile;
(globalThis as any).Blob = BunBlob;

(globalThis as any).p9r = {
    attr:  P9R_ATTR,
    mode:  P9R_MODE,
    event: P9R_EVENT,
    id:    P9R_ID,
    cache: P9R_CACHE,
};

(document as any).compIdentifierToEditor = new Map();

const editorSystem = document.createElement("div");
editorSystem.id = P9R_ID.EDITOR_SYSTEM;
document.body.appendChild(editorSystem);

(document as any).EditorManager = {
    getEditorSystemHTMLElement: () => editorSystem,
    getBlocActionGroup: () => ({
        close: () => {},
        open: () => {},
        setEditor: () => {},
    }),
};
