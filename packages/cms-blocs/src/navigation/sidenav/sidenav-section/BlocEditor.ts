import { Editor } from '@bernouy/cms-control/editor';
import Config from './configuration.html' with { type: 'text' };

export class BlocEditor extends Editor {

    constructor(target: HTMLElement) {
        super(target, "", Config as unknown as string);
        this._syncNested();
    }

    init() {
        this._observer = new MutationObserver(() => this._syncNested());
        this._observer.observe(document.body, { childList: true, subtree: true });
    }

    restore() {
        this._observer?.disconnect();
        this._observer = null;
    }

    private _observer: MutationObserver | null = null;

    // Tag-agnostic: flag the target when any light-DOM ancestor shares
    // its nodeName. Baked into the DOM so the public view reads it via
    // CSS with no runtime JS.
    private _syncNested(): void {
        let parent: Element | null = this.target.parentElement;
        while (parent) {
            if (parent.nodeName === this.target.nodeName) {
                if (!this.target.hasAttribute('data-nested')) {
                    this.target.setAttribute('data-nested', '');
                }
                return;
            }
            parent = parent.parentElement;
        }
        if (this.target.hasAttribute('data-nested')) {
            this.target.removeAttribute('data-nested');
        }
    }

}
