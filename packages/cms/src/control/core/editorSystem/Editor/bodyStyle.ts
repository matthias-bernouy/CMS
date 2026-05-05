/**
 * Reference-counted registry that mounts a single <style> element on
 * <body> per tag name. Editors that need shadow-less styling (e.g. an
 * <h1> editor that can't attach a shadow root) acquire here and release
 * on dispose so the stylesheet is removed once the last consumer is gone.
 */

type Entry = { el: HTMLStyleElement; count: number };

const registry = new Map<string, Entry>();

export function acquireBodyStyle(tag: string, el: HTMLStyleElement): void {
    let entry = registry.get(tag);
    if (!entry) {
        document.body.append(el);
        entry = { el, count: 0 };
        registry.set(tag, entry);
    }
    entry.count++;
}

export function releaseBodyStyle(tag: string): void {
    const entry = registry.get(tag);
    if (!entry) return;
    entry.count--;
    if (entry.count <= 0) {
        entry.el.remove();
        registry.delete(tag);
    }
}
