/**
 * Tracks whether the editor has unsaved changes since the last load/save.
 * Wired by EditorRoot at boot — a `MutationObserver` on the working area
 * marks dirty on any DOM mutation. Listeners react when navigation might
 * lose work (LinkEditor confirm dialog, navigationGuard `beforeunload`).
 *
 * Reset hook: callers (Editor save flow, snippet expansion etc.) call
 * `clearDirty()` after a successful save / fresh load.
 */

let _dirty = false;
const _listeners = new Set<(dirty: boolean) => void>();

export function isDirty(): boolean { return _dirty; }

export function markDirty(): void {
    if (_dirty) return;
    _dirty = true;
    for (const fn of _listeners) try { fn(true); } catch {}
}

export function clearDirty(): void {
    if (!_dirty) return;
    _dirty = false;
    for (const fn of _listeners) try { fn(false); } catch {}
}

/** Subscribe to dirty state changes. Returns an unsubscribe function. */
export function onDirtyChange(fn: (dirty: boolean) => void): () => void {
    _listeners.add(fn);
    return () => { _listeners.delete(fn); };
}

/**
 * Wire a `MutationObserver` on the given element. Any structural or
 * attribute change inside is treated as a user edit. Returns a `stop`
 * function so the consumer can disconnect on EditorRoot teardown.
 */
export function watchForDirty(workingElement: Element): () => void {
    const observer = new MutationObserver(() => markDirty());
    observer.observe(workingElement, {
        childList:        true,
        subtree:          true,
        attributes:       true,
        characterData:    true,
    });
    return () => observer.disconnect();
}
