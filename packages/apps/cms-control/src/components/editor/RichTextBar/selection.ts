/**
 * Small helper for capturing and restoring a document selection across
 * clicks on the toolbar (which would otherwise wipe the user's selection
 * in the editor).
 */
export class SelectionTracker {
    private savedRange: Range | null = null;

    /** Snapshots the current selection, if any. */
    save() {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
            this.savedRange = sel.getRangeAt(0).cloneRange();
        }
    }

    /** Re-applies the last snapshot as the active selection. */
    restore() {
        if (!this.savedRange) return;
        const sel = window.getSelection();
        if (sel) {
            sel.removeAllRanges();
            sel.addRange(this.savedRange);
        }
    }

    get range(): Range | null {
        return this.savedRange;
    }
}
