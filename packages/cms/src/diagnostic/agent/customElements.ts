import { mark } from "./marks";

/**
 * Wrap `customElements.define` to record per-tag registration timestamps.
 * Must be called before any deferred bloc IIFE runs — that's why the agent
 * is inlined synchronously at the top of <head>.
 *
 * Pairs with `trackWhenDefined`: `define:start/end` measures the cost of
 * the registration itself, `defined` records when the tag passes its
 * `:defined` check (which is what unlocks the FOUC shell).
 */
export function patchDefine(): void {
    const original = customElements.define.bind(customElements);
    customElements.define = function patched(name: string, ctor: CustomElementConstructor, options?: ElementDefinitionOptions) {
        mark("define:start", name);
        const t0 = performance.now();
        const result = original(name, ctor, options);
        mark("define:end", name, performance.now() - t0);
        return result;
    } as typeof customElements.define;
}

export function trackWhenDefined(tags: string[]): void {
    const promises = tags.map(tag => customElements.whenDefined(tag).then(() => mark("defined", tag)));
    Promise.all(promises).then(() => mark("all-defined"));
}
