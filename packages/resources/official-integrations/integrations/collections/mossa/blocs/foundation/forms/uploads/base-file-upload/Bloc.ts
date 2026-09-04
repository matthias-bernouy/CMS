import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { Component } from "@bernouy/components/base";

const ATTR_MIRROR = ["name", "required", "disabled", "multiple", "capture"];
const ATTR_OWN = ["min", "max"];

/**
 * `<base-file-upload>` — themed photo uploader with a grid of preview
 * cards and an "+ Ajouter" tile of identical size at the end.
 *
 * The user sees thumbnails of their files (with a × to drop one), not
 * raw filenames. Each newly-picked or dropped file is appended to the
 * internal list (instead of replacing it like the native input would).
 * The native `<input type="file">` is kept in sync via `DataTransfer`
 * so the surrounding `<base-form>` and any form-data serializer see
 * the right `FileList`.
 *
 * Exposes `value` (file count as string) and `checkValidity()` so a
 * stepper using `validate-on="change"` only advances once `min` files
 * are present.
 */
export class Bloc extends Component {
    static observedAttributes = [...ATTR_MIRROR, ...ATTR_OWN];

    private _input: HTMLInputElement | null = null;
    private _grid: HTMLElement | null = null;
    private _addCard: HTMLElement | null = null;
    private _counterProg: HTMLElement | null = null;
    private _counterCta: HTMLElement | null = null;
    private _slotAccept: HTMLSlotElement | null = null;

    /** Mutable file list — FileList is read-only so we maintain our own
     *  array and rewrite the native input via DataTransfer in `_commit`. */
    private _files: File[] = [];

    /** Blob URLs created via createObjectURL — revoked on each render
     *  cycle (and on disconnect) so they don't leak. */
    private _objectUrls = new Set<string>();

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        const root = this.shadowRoot!;
        this._input = root.querySelector("input") as HTMLInputElement;
        this._grid = root.querySelector(".grid");
        this._addCard = root.querySelector(".add-card");
        this._counterProg = root.querySelector(".counter-progress");
        this._counterCta = root.querySelector(".counter-cta");
        this._slotAccept = root.querySelector('slot[name="accept"]');
        if (!this._input || !this._grid || !this._addCard) {
            return;
        }

        this._slotAccept?.addEventListener("slotchange", this._syncAccept);
        this._input.addEventListener("change", this._onNativeChange);
        this._addCard.addEventListener("dragover", this._onDragOver);
        this._addCard.addEventListener("dragleave", this._onDragLeave);
        this._addCard.addEventListener("drop", this._onDrop);

        this._syncAccept();
        this._syncAttrs();
        this._render();
    }

    disconnectedCallback(): void {
        this._slotAccept?.removeEventListener("slotchange", this._syncAccept);
        this._input?.removeEventListener("change", this._onNativeChange);
        this._addCard?.removeEventListener("dragover", this._onDragOver);
        this._addCard?.removeEventListener("dragleave", this._onDragLeave);
        this._addCard?.removeEventListener("drop", this._onDrop);
        this._revokeAll();
    }

    attributeChangedCallback() {
        this._syncAttrs();
        this._render();
    }

    // ── Public API (form integration) ─────────────────────────────

    /** Human-readable summary of what's been picked. Used by the stepper's
     *  hasValue check and shown in the auto-summary recap. The actual file
     *  bytes are NOT in here — `<base-form>` reads them via `.files`. */
    get value(): string {
        const n = this._files.length;
        if (n === 0) {
            return "";
        }
        if (n === 1) {
            return this._files[0]?.name ?? "1 fichier";
        }
        return `${n} photos`;
    }

    /** Same readable form for the auto-summary recap. */
    get displayValue(): string {
        return this.value;
    }

    /** Native-input-style getter — the conventional way to expose file
     *  payload to any consumer that walks `[name]` light-DOM. `<base-form>`
     *  duck-types on this to detect and switch to multipart encoding. */
    get files(): FileList | null {
        return this._input?.files ?? null;
    }

    get name(): string {
        return this.getAttribute("name") ?? "";
    }

    checkValidity(): boolean {
        const min = this._readCount("min", this.hasAttribute("required") ? 1 : 0);
        const max = this._readCount("max", Number.POSITIVE_INFINITY);
        return this._files.length >= min && this._files.length <= max;
    }

    // ── State mutations ───────────────────────────────────────────

    private _addFiles(newFiles: FileList | File[]): void {
        const max = this._readCount("max", Number.POSITIVE_INFINITY);
        const incoming = newFiles instanceof FileList ? Array.from(newFiles) : newFiles;
        for (const f of incoming) {
            if (this._files.length >= max) {
                break;
            }
            const key = `${f.name}-${f.size}-${f.lastModified}`;
            const dup = this._files.some((g) => `${g.name}-${g.size}-${g.lastModified}` === key);
            if (dup) {
                continue;
            }
            this._files.push(f);
        }
        this._commit();
    }

    private _removeAt(idx: number): void {
        if (idx < 0 || idx >= this._files.length) {
            return;
        }
        this._files.splice(idx, 1);
        this._commit();
    }

    private _commit(): void {
        if (this._input) {
            const dt = new DataTransfer();
            for (const f of this._files) {
                dt.items.add(f);
            }
            this._input.files = dt.files;
        }
        this._refreshValidity();
        this._render();
        this.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    }

    // ── Rendering ─────────────────────────────────────────────────

    private _render(): void {
        if (!this._grid || !this._addCard) {
            return;
        }

        // Remove old filled cards (keep the add card)
        this._grid.querySelectorAll(".card.filled").forEach((c) => c.remove());

        // Revoke previously-issued blob URLs before creating new ones.
        // Cheap and simple — we recreate cards from scratch each render.
        this._revokeAll();

        for (let i = 0; i < this._files.length; i++) {
            const file = this._files[i];
            if (!file) {
                continue;
            }
            this._grid.insertBefore(this._makeFilledCard(file, i), this._addCard);
        }

        const max = this._readCount("max", Number.POSITIVE_INFINITY);
        this.toggleAttribute("at-max", Number.isFinite(max) && this._files.length >= max);

        this._updateCounter();
    }

    private _makeFilledCard(file: File, idx: number): HTMLElement {
        const card = document.createElement("div");
        card.className = "card filled";

        if (file.type.startsWith("image/")) {
            const url = URL.createObjectURL(file);
            this._objectUrls.add(url);
            const img = document.createElement("img");
            img.className = "thumb";
            img.src = url;
            img.alt = file.name;
            card.append(img);
        } else {
            const fallback = document.createElement("div");
            fallback.className = "thumb-fallback";
            const icon = document.createElement("span");
            icon.className = "thumb-fallback-icon";
            icon.innerHTML =
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
            const name = document.createElement("span");
            name.textContent = file.name;
            fallback.append(icon, name);
            card.append(fallback);
        }

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "remove";
        remove.setAttribute("aria-label", `Retirer ${file.name}`);
        remove.innerHTML =
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
        remove.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            this._removeAt(idx);
        });
        card.append(remove);

        return card;
    }

    private _revokeAll(): void {
        for (const url of this._objectUrls) {
            URL.revokeObjectURL(url);
        }
        this._objectUrls.clear();
    }

    // ── Counter ───────────────────────────────────────────────────

    private _updateCounter(): void {
        if (!this._counterProg || !this._counterCta) {
            return;
        }
        const hasMin = this.hasAttribute("min");
        const hasMax = this.hasAttribute("max");
        if (!hasMin && !hasMax) {
            this._counterProg.textContent = "";
            this._counterCta.textContent = "";
            return;
        }

        const count = this._files.length;
        const min = this._readCount("min", 0);
        const max = this._readCount("max", Number.POSITIVE_INFINITY);

        if (Number.isFinite(max)) {
            this._counterProg.textContent = `${count} / ${max} photos`;
        } else {
            this._counterProg.textContent = `${count} photos`;
        }

        if (count < min) {
            const remaining = min - count;
            this._counterCta.textContent =
                remaining === 1 ? "encore 1 pour valider" : `encore ${remaining} pour valider`;
        } else {
            this._counterCta.textContent = "";
        }
    }

    // ── Helpers ───────────────────────────────────────────────────

    private _readCount(attr: "min" | "max", fallback: number): number {
        const raw = this.getAttribute(attr);
        if (raw == null) {
            return fallback;
        }
        const n = parseInt(raw, 10);
        return Number.isFinite(n) ? n : fallback;
    }

    private _syncAccept = () => {
        if (!this._input || !this._slotAccept) {
            return;
        }
        const v = this._readSlot(this._slotAccept);
        if (v) {
            this._input.accept = v;
        } else {
            this._input.removeAttribute("accept");
        }
    };

    private _readSlot(slot: HTMLSlotElement): string {
        return slot
            .assignedNodes({ flatten: true })
            .map((n) => (n as Node).textContent ?? "")
            .join("")
            .trim();
    }

    private _syncAttrs() {
        if (!this._input) {
            return;
        }
        for (const a of ATTR_MIRROR) {
            const v = this.getAttribute(a);
            if (v == null) {
                this._input.removeAttribute(a);
            } else {
                this._input.setAttribute(a, v);
            }
        }
    }

    private _refreshValidity(): void {
        if (!this._input) {
            return;
        }
        if (this.checkValidity()) {
            this._input.setCustomValidity("");
        } else {
            const min = this._readCount("min", this.hasAttribute("required") ? 1 : 0);
            this._input.setCustomValidity(`Sélectionne au moins ${min} fichier${min > 1 ? "s" : ""}.`);
        }
    }

    // ── Native input / drag-and-drop events ───────────────────────

    private _onNativeChange = () => {
        if (!this._input?.files) {
            return;
        }
        // Drain the picker's FileList into our internal array (appending,
        // not replacing) and clear the native value so re-picking the same
        // file would still fire `change`.
        const picked = Array.from(this._input.files);
        this._input.value = "";
        this._addFiles(picked);
    };

    private _onDragOver = (e: DragEvent) => {
        if (this.hasAttribute("disabled")) {
            return;
        }
        e.preventDefault();
        this.setAttribute("dragging", "");
    };

    private _onDragLeave = (e: DragEvent) => {
        if (e.target !== this._addCard) {
            return;
        }
        this.removeAttribute("dragging");
    };

    private _onDrop = (e: DragEvent) => {
        if (this.hasAttribute("disabled")) {
            return;
        }
        e.preventDefault();
        this.removeAttribute("dragging");
        if (!e.dataTransfer) {
            return;
        }
        this._addFiles(e.dataTransfer.files);
    };
}
