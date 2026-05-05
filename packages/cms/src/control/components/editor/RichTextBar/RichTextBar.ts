import { Component } from "@bernouy/cms/component";
import "src/control/components/editor/componentSync/PageLink/PageLink";

import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

import { SelectionTracker } from "./selection";
import { closeLinkBar } from "./actions";
import {
    handleClick,
    handleOutsideMouseDown,
    handleRootMousedown,
    handleRootMouseup,
    handleSelection,
} from "./listener";

export class RichTextBar extends Component {

    selection = new SelectionTracker();
    interacting = false;
    pageLink: HTMLElement | null = null;

    // Stable handler refs so connect/disconnect can pair up. Previously
    // these were arrow literals in connectedCallback — every re-append
    // (EditorManager.switchMode does exactly that) leaked 2 document
    // listeners (selectionchange + mousedown).
    private _onRootMousedown    = (e: Event)      => handleRootMousedown(this, e);
    private _onRootMouseup      = ()              => handleRootMouseup(this);
    private _onRootClick        = (e: Event)      => handleClick(this, e as MouseEvent);
    private _onSelectionChange  = ()              => handleSelection(this);
    private _onOutsideMousedown = (e: MouseEvent) => handleOutsideMouseDown(this, e);
    private _rootListenersAttached = false;

    constructor() {
        super({
            css,
            template: template as unknown as string,
        });
    }

    override connectedCallback() {
        const root = this.shadowRoot!;
        if (!this._rootListenersAttached) {
            // Shadow-root listeners survive re-parenting (the shadow root is
            // owned by this element), so attach once only — no matching
            // disconnectedCallback cleanup needed.
            root.addEventListener("mousedown", this._onRootMousedown);
            root.addEventListener("mouseup", this._onRootMouseup);
            root.addEventListener("click", this._onRootClick);
            this._rootListenersAttached = true;
        }
        document.addEventListener("selectionchange", this._onSelectionChange);
        // Selection-change alone doesn't close the bar when the user clicks an
        // element that doesn't collapse the caret (a non-editable sibling in
        // the parent, a BAG button with preventDefault, etc.). Catch those via
        // a document-level mousedown outside the bar and outside the current
        // editable.
        document.addEventListener("mousedown", this._onOutsideMousedown);

        if (!this.pageLink) {
            this.pageLink = document.createElement("p9r-link");
            this.pageLink.setAttribute("label", "");
            this.pageLink.setAttribute("name", "href");
            root.querySelector(".link-pages-wrap")!.appendChild(this.pageLink);
        }
    }

    disconnectedCallback() {
        document.removeEventListener("selectionchange", this._onSelectionChange);
        document.removeEventListener("mousedown", this._onOutsideMousedown);
    }

    show(rect: DOMRect) {
        this.classList.add("visible");
        this.shadowRoot!.querySelector(".color-panel")?.classList.remove("open");
        closeLinkBar(this);

        const scrollX = window.scrollX;
        const scrollY = window.scrollY;
        const gap = 10;
        const barWidth = this.offsetWidth;
        const barHeight = this.offsetHeight;

        let top: number;
        if (rect.top < barHeight + gap) {
            top = rect.bottom + scrollY + gap;
        } else {
            top = rect.top + scrollY - barHeight - gap;
        }

        let left = rect.left + scrollX + (rect.width - barWidth) / 2;
        const minLeft = scrollX + gap;
        const maxLeft = scrollX + window.innerWidth - barWidth - gap;
        left = Math.max(minLeft, Math.min(maxLeft, left));

        this.style.top = `${top}px`;
        this.style.left = `${left}px`;
    }

    hide() {
        this.classList.remove("visible");
        this.shadowRoot!.querySelector(".color-panel")?.classList.remove("open");
        closeLinkBar(this);
    }
}

customElements.define("cms-richtextbar", RichTextBar);
