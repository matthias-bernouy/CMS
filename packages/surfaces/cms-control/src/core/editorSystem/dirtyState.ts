/**
 * Tracks whether the editor has unsaved changes since load/save — by comparing
 * the SERIALIZED authored content against a baseline, NOT by observing DOM
 * mutations.
 *
 * Why snapshot, not mutation-observation: the canvas is full of components that
 * mutate their OWN DOM with no user involvement — `<w13c-snippet>` expands,
 * blocs reflect attributes on upgrade, custom elements hydrate. A mutation
 * watcher (even with a chrome-attr denylist) can't tell those apart from a real
 * edit, so it false-marks dirty at boot. Instead we snapshot the content the
 * SAVE would persist (`EditorRoot.pageContent` — chrome-stripped, runtime-stamp
 * free, proven byte-stable across component self-mutation) and diff on demand.
 *
 * The baseline is captured LAZILY, on the user's FIRST interaction in the
 * editor: before any user gesture nothing is an edit (all boot churn is the
 * framework's), so `isDirty()` is false; the first pointerdown/keydown/paste/
 * drop — which fire BEFORE the mutation they cause — freezes the pre-edit state
 * as the baseline. `clearDirty()` re-baselines after a successful save.
 */

let _getContent: (() => string) | null = null;
let _baseline: string | null = null;

/** True once a baseline exists (the user has interacted) AND the serialized
 *  content has diverged from it. Cheap: one `getContent()` per call, and
 *  callers (the view-toggle guard, link/unload confirms) ask infrequently. */
export function isDirty(): boolean {
    return _baseline !== null && _getContent !== null && _getContent() !== _baseline;
}

/** After a successful save (or a programmatic re-sync): the current content
 *  becomes the new clean baseline. */
export function clearDirty(): void {
    if (_getContent) _baseline = _getContent();
}

/** Events that fire BEFORE the DOM mutation they trigger — so capturing the
 *  baseline here freezes the state just before the user's first edit. (`input`
 *  is deliberately excluded: it fires AFTER the change.) */
const FIRST_INTERACTION = ["pointerdown", "keydown", "paste", "drop"] as const;

/**
 * Arm snapshot dirty-tracking on the editor `host`. `getContent` returns the
 * content the save would persist (pass `() => editorRoot.pageContent`). No
 * baseline is captured yet — the first user interaction freezes it. Returns a
 * disarm function for teardown.
 */
export function armDirty(host: Element, getContent: () => string): () => void {
    _getContent = getContent;
    _baseline = null;

    const capture = () => { if (_baseline === null && _getContent) _baseline = _getContent(); };
    for (const ev of FIRST_INTERACTION) host.addEventListener(ev, capture, true);

    return () => {
        for (const ev of FIRST_INTERACTION) host.removeEventListener(ev, capture, true);
        _getContent = null;
        _baseline = null;
    };
}
