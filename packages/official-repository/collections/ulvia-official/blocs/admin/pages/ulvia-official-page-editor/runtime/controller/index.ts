import { mutationFormRequest } from "@bernouy/cms-content/browser";
import { callCapability } from "../client";
import { EditorFrame } from "../frame";
import type { EditorCatalogue, EditorCatalogueItem } from "../model";
import { EditorStatus } from "../status";
import { PageEditingState } from "./editing";
import { PageEditorInteractions, type SiteCompositionInput } from "./interactions";
import { PageEditorSession } from "./session";
import { PageEditorView } from "./view";

export class PageEditorController {
    private readonly editing = new PageEditingState();
    private catalogue: EditorCatalogueItem[] = [];
    private readonly session = new PageEditorSession();
    private dirty = false;
    private catalogueLoaded = false;
    private readonly interactions: PageEditorInteractions;
    private readonly observer: MutationObserver;
    private readonly status: EditorStatus;
    private readonly view: PageEditorView;
    private frame: EditorFrame | null = null;
    private previewStale = false;

    constructor(private readonly blocRoot: HTMLElement) {
        this.status = new EditorStatus(this.blocRoot);
        this.view = new PageEditorView(this.blocRoot);
        this.interactions = new PageEditorInteractions(this.blocRoot, {
            catalogue: () => this.catalogue,
            changed: (options) => {
                this.changed(options);
            },
            createComposition: (input) => this.createComposition(input),
            dirty: () => this.dirty,
            editing: this.editing,
            frame: () => this.frame,
            save: () => {
                void this.save();
            },
            view: this.view,
        });
        this.observer = new MutationObserver(() => {
            this.initializeFromBinding();
        });
    }

    connect(): void {
        this.interactions.connect();
        window.addEventListener("beforeunload", this.handleBeforeUnload);
        this.observer.observe(this.blocRoot, { childList: true, subtree: true });
        this.initializeFromBinding();
    }

    private initializeFromBinding(): void {
        const ready = this.view.query<HTMLElement>("[data-editor-ready]");
        if (!ready) {
            return;
        }
        const id = ready.querySelector<HTMLElement>("[data-page-id]")?.textContent?.trim() ?? "";
        const revision = Number(ready.querySelector<HTMLElement>("[data-page-revision]")?.textContent?.trim());
        const content = ready.querySelector<HTMLTextAreaElement>("[data-page-content]")?.value ?? "";
        if (!id || !Number.isSafeInteger(revision)) {
            this.status.notice(this.view.copy("page-identity-missing"), true);
            return;
        }
        if (!this.session.initialize(id, revision, content)) {
            return;
        }
        this.connectFrame();
        this.editing.initialize(content);
        this.dirty = false;
        this.previewStale = false;
        this.render();
        if (!this.catalogueLoaded) {
            this.catalogueLoaded = true;
            void this.loadCatalogue();
        }
    }

    disconnect(): void {
        this.interactions.disconnect();
        window.removeEventListener("beforeunload", this.handleBeforeUnload);
        this.frame?.disconnect();
        this.status.clearNotice();
        this.observer.disconnect();
    }

    private async loadCatalogue(): Promise<void> {
        await this.status.run(async () => {
            const response = await callCapability<EditorCatalogue>("editor-catalogue", {});
            this.catalogue = response.items;
        });
        this.render();
    }

    private async save(): Promise<void> {
        const saved = await this.status.run(async () => {
            this.view.required("[data-save-state]").textContent = this.view.copy("saving");
            const updated = await this.session.save(this.editing.document.serialize(), {
                changed: this.view.copy("page-changed"),
                missingRevision: this.view.copy("page-revision-missing"),
            });
            this.editing.applySaved(updated.content);
            this.dirty = false;
            this.previewStale = false;
            this.status.notice(this.view.copy("document-saved"));
        });
        this.render();
        if (saved) {
            this.view.reloadPreview();
        }
    }

    private async createComposition(input: SiteCompositionInput): Promise<boolean> {
        const created = await this.status.run(async () => {
            const draft = (await mutationFormRequest(this.blocRoot, "createSiteBloc", input)) as {
                tag: string;
                draftRevision: number;
            };
            await mutationFormRequest(this.blocRoot, "publishSiteBloc", {
                tag: draft.tag,
                revision: draft.draftRevision,
            });
            const response = await callCapability<EditorCatalogue>("editor-catalogue", {});
            this.catalogue = response.items;
            this.status.notice(this.view.copy("composition-created"));
            return true;
        });
        this.render();
        return created === true;
    }

    private changed(options: { render?: boolean; previewStale?: boolean } = {}): void {
        this.status.clearNotice();
        this.dirty = this.session.isDirty(this.editing.document.serialize());
        this.previewStale = this.dirty && (this.previewStale || options.previewStale === true);
        if (options.render !== false) {
            this.render();
            return;
        }
        this.view.updateSaveState(this.dirty);
        this.view.updateHistoryState(this.editing.history);
        this.view.updatePreviewState(this.previewStale);
    }

    private render(): void {
        this.view.render({
            catalogue: this.catalogue,
            document: this.editing.document,
            dirty: this.dirty,
            frame: this.frame,
            history: this.editing.history,
            insertionTarget: this.editing.insertionTarget,
            previewStale: this.previewStale,
            selected: this.editing.selected,
        });
    }

    private connectFrame(): void {
        if (this.frame) {
            return;
        }
        this.frame = new EditorFrame(
            this.view.required("[data-preview]"),
            this.view.required("[data-frame-highlight]"),
            (source) => {
                this.editing.selected = source;
                this.render();
            },
            () => {
                this.render();
            },
        );
        this.frame.connect();
    }

    private readonly handleBeforeUnload = (event: BeforeUnloadEvent): void => {
        if (this.dirty) {
            event.preventDefault();
        }
    };
}
