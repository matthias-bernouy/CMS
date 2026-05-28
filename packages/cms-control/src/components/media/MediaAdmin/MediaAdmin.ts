import type { GridMedia } from "../GridMedia/GridMedia";
import { uploadFiles, createFolder } from "../GridMedia/api/write";
import BubblesEvent from "../../../core/dom/BubblesEvent";
import template from "./MediaAdmin.html" with { type: "text" };

type FormFieldEl = HTMLElement & { value: string };

/**
 * `<cms-media-admin>` — full media admin page: layout, header buttons,
 * and same-origin calls to the `/api/files/*` endpoints. Renders into light
 * DOM so the embedded `<p9r-grid-media>` keeps using its existing API surface.
 *
 * Header buttons bypass `<cms-form>` because uploads go through a multipart
 * POST to `/api/files/upload`, not a JSON form post.
 */
export class MediaAdmin extends HTMLElement {

    private _grid: GridMedia | null = null;
    private _fileInput: HTMLInputElement | null = null;
    private _wired = false;

    connectedCallback() {
        if (!this.firstElementChild) this._render();
        if (!this._wired) { this._wire(); this._wired = true; }
    }

    private _render() {
        this.innerHTML = template as unknown as string;
    }

    private _wire() {
        this._grid = this.querySelector("p9r-grid-media") as GridMedia | null;
        this._fileInput = this.querySelector('[data-role="file-input"]') as HTMLInputElement | null;

        this.querySelector('[data-action="upload"]')?.addEventListener("click", () => this._fileInput?.click());
        this._fileInput?.addEventListener("change", () => this._handleUpload());
        this.querySelector('[data-action="create-folder"]')?.addEventListener("click", () => this._handleCreateFolder());
        this.querySelector('[data-role="folder-name"]')?.addEventListener("keydown", (e) => {
            if ((e as KeyboardEvent).key === "Enter") { e.preventDefault(); this._handleCreateFolder(); }
        });
    }

    private async _handleUpload() {
        const files = this._fileInput?.files;
        if (!files || files.length === 0) return;
        await uploadFiles(files, this._currentFolder());
        if (this._fileInput) this._fileInput.value = "";
        this._grid?.refresh();
    }

    private async _handleCreateFolder() {
        const button = this.querySelector('[data-action="create-folder"]');
        const input = this.querySelector('[data-role="folder-name"]') as FormFieldEl | null;
        const name = input?.value?.trim();
        if (!name) return;
        const ok = await createFolder(name, this._currentFolder());
        if (!ok) return;
        if (input) input.value = "";
        button?.dispatchEvent(new BubblesEvent("form:success"));
        this._grid?.refresh();
    }

    private _currentFolder(): string | null {
        return new URL(window.location.href).searchParams.get("folder");
    }
}

if (!customElements.get("cms-media-admin")) customElements.define("cms-media-admin", MediaAdmin);
