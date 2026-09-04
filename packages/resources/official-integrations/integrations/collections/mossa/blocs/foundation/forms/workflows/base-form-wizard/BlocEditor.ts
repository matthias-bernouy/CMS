import { Editor, registerEditor, type SettingSection, type ContentSlot } from "@bernouy/cms-content/editor";

/**
 * Editor for `<base-form-wizard>`. The runtime only lets the user jump
 * to a step from the progress bar when that step is `complete`; in the
 * editor we want any bubble to be reachable so the author can edit any
 * step's content without having to walk through the wizard. The
 * capture-phase click listener registered in `mountEditor()` does that by
 * setting the wizard's `current-step` attribute directly. Production
 * code is untouched (see rule 11).
 *
 * The CSS also makes every bubble look interactive (cursor + hover) so
 * the affordance is obvious.
 */
const editorCSS = `
.progress-item {
    cursor: pointer;
}

.progress-item:hover .progress-bubble {
    background: var(--ulvia-primary-base);
    color: var(--ulvia-primary-foreground);
}
`;

export class BlocEditor extends Editor {
    // -- Generated from legacy editor metadata --

    protected override settings(): SettingSection[] {
        return [
            {
                "kind": "self",
                "label": "Initial state",
                "settings": [
                    {
                        "type": "text",
                        "label": "Step shown on load (1-indexed)",
                        "attribute": "current-step",
                        "placeholder": "1",
                        "help": "Min 1",
                    },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [
            {
                "label": "Steps",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "min": 1,
            },
        ];
    }
    // -- End generated legacy editor metadata --

    private readonly _legacyEditorStyle = document.createElement("style");

    private _onProgressClick: ((e: Event) => void) | null = null;
    private _progressList: HTMLElement | null = null;

    constructor(target: HTMLElement) {
        super(target);
    }

    override mountEditor(): void {
        this._legacyEditorStyle.textContent = editorCSS;
        this.target.shadowRoot?.append(this._legacyEditorStyle);
        this._progressList = this.target.shadowRoot?.querySelector(".progress-list") as HTMLElement | null;
        if (!this._progressList) {
            return;
        }
        this._onProgressClick = (e: Event) => {
            const t = e.target as HTMLElement | null;
            const item = t?.closest(".progress-item") as HTMLElement | null;
            if (!item) {
                return;
            }
            const step = item.getAttribute("data-step");
            if (!step) {
                return;
            }
            e.stopImmediatePropagation();
            this.target.setAttribute("current-step", step);
        };
        this._progressList.addEventListener("click", this._onProgressClick, true);
    }

    override unmountEditor(): void {
        this._legacyEditorStyle.remove();
        if (this._progressList && this._onProgressClick) {
            this._progressList.removeEventListener("click", this._onProgressClick, true);
        }
        this._progressList = null;
        this._onProgressClick = null;
    }
}

registerEditor({ editor: BlocEditor });
