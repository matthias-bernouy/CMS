import type { CDN } from "@bernouy/core";
import type { GridMedia } from "../GridMedia/GridMedia";
import BubblesEvent from "../../../core/dom/BubblesEvent";
import template from "./MediaAdmin.html" with { type: "text" };

type FormFieldEl = HTMLElement & { value: string };

/**
 * `<cms-media-admin>` — full media admin page: layout, header buttons,
 * and direct calls to `window._cms.Media`. Renders into light DOM so the
 * embedded `<p9r-grid-media>` keeps using its existing API surface.
 *
 * Header buttons bypass `<cms-form>` because the `Media` consumer (e.g.
 * `HttpMedia`) handles its own transport — uploads go through
 * `media.uploadFile()`, not multipart-form posts.
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
        const folder = this._currentFolder();
        for (const f of Array.from(files)) {
            await this._media().uploadFile({
                data: f,
                name: f.name,
                mimeType: f.type || "application/octet-stream",
                size: f.size,
                ...(folder ? { folderID: folder } : {}),
            });
        }
        if (this._fileInput) this._fileInput.value = "";
        this._grid?.refresh();
    }

    private async _handleCreateFolder() {
        const button = this.querySelector('[data-action="create-folder"]');
        const input = this.querySelector('[data-role="folder-name"]') as FormFieldEl | null;
        const name = input?.value?.trim();
        if (!name) return;
        const folder = this._currentFolder();
        const res = await this._media().createFolder({
            name,
            ...(folder ? { parentFolderID: folder } : {}),
        });
        if (!res.ok) return;
        if (input) input.value = "";
        button?.dispatchEvent(new BubblesEvent("form:success"));
        this._grid?.refresh();
    }

    private _currentFolder(): string | null {
        return new URL(window.location.href).searchParams.get("folder");
    }

    private _media(): CDN {
        const m = window._cms?.Media;
        if (!m) throw new Error("window._cms.Media missing — admin must load /<basePath>/_cms/media.js first");
        return m;
    }
}

if (!customElements.get("cms-media-admin")) customElements.define("cms-media-admin", MediaAdmin);
