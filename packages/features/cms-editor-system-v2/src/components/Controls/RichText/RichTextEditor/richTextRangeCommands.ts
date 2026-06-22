import { findRangeWrapper, unwrapElement, wrapRangeContents } from "./richTextRangeDom";

const TEXT_SIZE_STEPS = [".875em", "1em", "1.125em", "1.25em", "1.5em"] as const;

export class RichTextRangeCommands {
    private _savedRange: Range | null = null;

    constructor(
        private readonly _editor: () => HTMLElement,
        private readonly _selection: () => Selection | null,
    ) {}

    hasSelectedRange(): boolean {
        return Boolean(this._savedRange && !this._savedRange.collapsed);
    }

    saveSelection = (): void => {
        const selection = this._selection();
        if (!selection || selection.rangeCount === 0) return;
        const range = selection.getRangeAt(0);
        if (!this._editor().contains(range.commonAncestorContainer)) return;
        this._savedRange = range.cloneRange();
    };

    restoreSelection(): void {
        if (!this._savedRange) return;
        const selection = this._selection();
        if (!selection) return;
        selection.removeAllRanges();
        selection.addRange(this._savedRange);
    }

    toggleRange(tagName: string): void {
        if (this.unwrapMatchingRange(tagName)) return;
        this.wrapRange(tagName);
    }

    wrapRange(tagName: string, attributes: Record<string, string> = {}): void {
        const range = this.getUsableRange();
        if (!range || range.collapsed) return;

        this.setSavedRange(wrapRangeContents(range, tagName, attributes));
    }

    unwrapMatchingRange(tagName: string, predicate: (element: HTMLElement) => boolean = () => true): boolean {
        const range = this.getUsableRange();
        if (!range) return false;

        const wrapper = findRangeWrapper(this._editor(), range, tagName, predicate);
        if (!wrapper) return false;

        this.setSavedRange(unwrapElement(this._editor(), wrapper));
        return true;
    }

    insertText(text: string): void {
        const range = this.getUsableRange();
        if (!range) {
            this._editor().append(text);
            const nextRange = document.createRange();
            nextRange.selectNodeContents(this._editor());
            nextRange.collapse(false);
            this.setSavedRange(nextRange);
            return;
        }

        range.deleteContents();
        const node = document.createTextNode(text);
        range.insertNode(node);

        const nextRange = document.createRange();
        nextRange.setStartAfter(node);
        nextRange.collapse(true);
        this.setSavedRange(nextRange);
    }

    stepTextSize(direction: "decrease" | "increase"): boolean {
        if (!this.hasSelectedRange()) return false;

        const range = this.getUsableRange();
        if (!range) return false;

        const wrapper = findRangeWrapper(this._editor(), range, "span", (element) => element.style.fontSize !== "");
        const currentIndex = wrapper ? TEXT_SIZE_STEPS.indexOf(wrapper.style.fontSize as typeof TEXT_SIZE_STEPS[number]) : 1;
        const fallbackIndex = currentIndex >= 0 ? currentIndex : 1;
        const nextIndex = direction === "increase"
            ? Math.min(TEXT_SIZE_STEPS.length - 1, fallbackIndex + 1)
            : Math.max(0, fallbackIndex - 1);

        if (wrapper) this.setSavedRange(unwrapElement(this._editor(), wrapper));
        this.wrapRange("span", { style: `font-size: ${TEXT_SIZE_STEPS[nextIndex]!}` });
        return true;
    }

    private getUsableRange(): Range | null {
        if (this._savedRange && this._editor().contains(this._savedRange.commonAncestorContainer)) {
            return this._savedRange.cloneRange();
        }

        const selection = this._selection();
        if (!selection || selection.rangeCount === 0) return null;

        const range = selection.getRangeAt(0);
        if (!this._editor().contains(range.commonAncestorContainer)) return null;

        return range.cloneRange();
    }

    private setSavedRange(range: Range): void {
        this._savedRange = range.cloneRange();
    }

}
