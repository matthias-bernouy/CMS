import { GlobalRegistrator } from "@happy-dom/global-registrator";

// Keep Bun's network and form primitives: happy-dom's replacements do not
// behave like the runtime APIs exercised by serialization and fetch tests.
const nativeGlobals = {
    Response: globalThis.Response,
    Request: globalThis.Request,
    Headers: globalThis.Headers,
    fetch: globalThis.fetch,
    FormData: globalThis.FormData,
    File: globalThis.File,
    Blob: globalThis.Blob,
    AbortController: globalThis.AbortController,
    AbortSignal: globalThis.AbortSignal,
};

GlobalRegistrator.register({ url: "http://localhost/" });

// happy-dom does not implement form-associated custom-element internals.
if (!HTMLElement.prototype.attachInternals) {
    Object.defineProperty(HTMLElement.prototype, "attachInternals", {
        configurable: true,
        value: () =>
            ({
                setFormValue: () => {},
                setValidity: () => {},
                states: { add: () => {}, delete: () => {}, has: () => false },
                form: null,
                labels: [],
            }) as unknown as ElementInternals,
    });
}

Object.assign(globalThis, nativeGlobals);
