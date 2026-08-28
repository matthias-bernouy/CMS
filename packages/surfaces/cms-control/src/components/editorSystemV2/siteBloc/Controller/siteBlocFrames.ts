import type { SiteBlocDefinition } from "@bernouy/cms-content";
import type { EditorCatalogEntry } from "@bernouy/cms-content/editor";
import { createSiteBlocCatalogs, isTagInsertable } from "../siteBlocCatalog";
import { scanPreviewAccessibility } from "../previewAccessibility";
import { siteBlocFrameUrl, type BlocCatalogueItem } from "../siteBlocApi";
import type { SiteBlocView } from "../siteBlocView";

export type SiteBlocFrameReadyDetail = { document: Document; kind: "editor" | "view"; url: string };

export class SiteBlocFrames {
    ready = false;
    dirty = false;
    private frameNonce = 0;
    private editorUrl = "";
    private previewUrl = "";
    private observer: MutationObserver | null = null;

    constructor(
        private readonly view: SiteBlocView,
        private readonly onStateChange: () => void,
    ) {}

    configure(
        definition: SiteBlocDefinition,
        catalogue: BlocCatalogueItem[],
        baseCatalog: Array<EditorCatalogEntry & { insertable?: boolean }>,
    ): void {
        this.ready = false;
        this.dirty = false;
        this.observer?.disconnect();
        const catalogs = createSiteBlocCatalogs(baseCatalog, catalogue, definition);
        this.view.shell.setCatalog(catalogs.structure);
        this.view.shell.setEditingPolicy({
            bindings: false,
            conditions: false,
            repeats: false,
            looseMedia: false,
            canInsertTag: (tag, entry) => this.canInsertStructureTag(catalogs.structureTags, tag, entry),
        });
        this.editorUrl = this.nextUrl(definition, "structure");
        this.previewUrl = this.nextUrl(definition, "preview");
        this.view.shell.setPreviewMode("external");
        this.view.shell.setFrameUrls({ editor: this.editorUrl, view: this.previewUrl });
        const archived = definition.lifecycle === "archived";
        this.view.setReadOnly(archived);
        this.view.shell.setEditorMode(archived ? "view" : "edit");
        this.view.setStatus(this.loadingStatus(definition));
        this.onStateChange();
    }

    handleReady(detail: SiteBlocFrameReadyDetail, definition: SiteBlocDefinition): void {
        if (!this.isCurrent(detail, definition)) {
            return;
        }
        if (detail.kind === "view") {
            this.view.showAccessibilityReport(scanPreviewAccessibility(detail.document));
            return;
        }
        this.ready = true;
        if (definition.lifecycle === "archived") {
            this.view.setStatus("Archived bloc · read-only preview. Restore it to continue editing.");
        } else {
            this.observe(detail.document);
            this.view.setStatus("Composition ready.");
        }
        this.onStateChange();
    }

    dispose(): void {
        this.observer?.disconnect();
    }

    private canInsertStructureTag(tags: ReadonlySet<string>, tag: string, entry: EditorCatalogEntry): boolean {
        return tag === "cms-site-slot-placeholder" || isTagInsertable(tags, tag, entry);
    }

    private observe(document: Document): void {
        this.observer?.disconnect();
        const root = document.querySelector<HTMLElement>("[data-cms-content]");
        if (!root) {
            return;
        }
        this.observer = new MutationObserver(() => {
            this.dirty = true;
            this.view.setStatus("Unsaved editor changes");
            this.onStateChange();
        });
        this.observer.observe(root, { attributes: true, childList: true, characterData: true, subtree: true });
    }

    private isCurrent(detail: SiteBlocFrameReadyDetail, definition: SiteBlocDefinition): boolean {
        if (!detail.url.includes("/api/site-bloc/frame")) {
            return false;
        }
        const url = new URL(detail.url, window.location.href);
        const expected = detail.kind === "view" ? this.previewUrl : this.editorUrl;
        return (
            url.href === new URL(expected, window.location.href).href &&
            url.searchParams.get("id") === definition.tag &&
            url.searchParams.get("revision") === String(definition.draftRevision)
        );
    }

    private nextUrl(definition: SiteBlocDefinition, mode: "structure" | "preview"): string {
        this.frameNonce += 1;
        return siteBlocFrameUrl(definition.tag, mode, definition.draftRevision, this.frameNonce);
    }

    private loadingStatus(definition: SiteBlocDefinition): string {
        if (definition.lifecycle === "archived") {
            return "Archived bloc · read-only preview. Restore it to continue editing.";
        }
        return "Loading composition…";
    }
}
