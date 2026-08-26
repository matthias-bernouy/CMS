import type { SiteBlocDefinition } from "@bernouy/cms-content";
import type { EditorCatalogEntry } from "@bernouy/cms-content/editor";
import {
    EDITOR_V2_DELETE_DOCUMENT_EVENT,
    EDITOR_V2_SAVE_DOCUMENT_EVENT,
    type EditorV2SaveDocumentDetail,
} from "@bernouy/cms-editor-system-v2";
import { configureShellCatalogAndFrame } from "../../shellSetup";
import { loadBlocCatalogue, loadSiteBloc, type BlocCatalogueItem, type SiteBlocMetadata } from "../siteBlocApi";
import { SiteBlocView } from "../siteBlocView";
import { SiteBlocActions } from "./siteBlocActions";
import { SiteBlocFrames, type SiteBlocFrameReadyDetail } from "./siteBlocFrames";

export class SiteBlocBuilderController {
    private readonly view: SiteBlocView;
    private readonly frames: SiteBlocFrames;
    private readonly actions: SiteBlocActions;
    private definition: SiteBlocDefinition | null = null;
    private catalogue: BlocCatalogueItem[] = [];
    private baseCatalog: Array<EditorCatalogEntry & { insertable?: boolean }> = [];
    private busy = true;
    private initialized = false;

    constructor(
        private readonly host: HTMLElement,
        private readonly root: ShadowRoot,
    ) {
        this.view = new SiteBlocView(root);
        this.frames = new SiteBlocFrames(this.view, () => this.renderControls());
        this.actions = new SiteBlocActions({
            view: this.view,
            frames: this.frames,
            definition: () => this.definition,
            setDefinition: (definition) => this.setDefinition(definition),
            dirty: () => this.dirty(),
            busy: () => this.busy,
            setBusy: (busy) => {
                this.busy = busy;
            },
            configure: () => this.configure(),
            renderControls: () => this.renderControls(),
            fail: (error) => this.fail(error, false),
        });
        this.view.shell.addEventListener(EDITOR_V2_SAVE_DOCUMENT_EVENT, this.onSaveDocument);
        this.view.shell.addEventListener(EDITOR_V2_DELETE_DOCUMENT_EVENT, this.onArchiveDocument);
        this.view.shell.addEventListener("editor-v2:frame-ready", this.onFrameReady);
        this.renderControls();
    }

    connect(): void {
        if (!this.initialized) {
            this.initialized = true;
            void this.initialize();
        }
    }

    disconnect(): void {
        this.frames.dispose();
    }

    private async initialize(): Promise<void> {
        const tag =
            this.host.getAttribute("bloc-id")?.trim() || new URL(window.location.href).searchParams.get("id")?.trim();
        if (!tag) {
            this.fail(new Error("Missing site bloc id."));
            return;
        }
        try {
            await this.view.configureShellChrome(() => this.actions.queue({ kind: "publish" }));
            const [definition, catalogue] = await Promise.all([
                loadSiteBloc(tag),
                loadBlocCatalogue(),
                configureShellCatalogAndFrame(this.view.shell, { frame: false }),
            ]);
            this.catalogue = catalogue;
            this.baseCatalog = [...this.view.shell.catalog];
            this.setDefinition(definition);
            this.busy = false;
            this.configure();
        } catch (error) {
            this.fail(error);
        }
    }

    private configure(): void {
        if (this.definition) {
            this.frames.configure(this.definition, this.catalogue, this.baseCatalog);
        }
    }

    private readonly onSaveDocument = (event: Event): void => {
        const detail = (event as CustomEvent<EditorV2SaveDocumentDetail>).detail;
        const metadata: SiteBlocMetadata = {
            name: detail.page.title,
            group: detail.page.tags.join(", "),
            description: detail.page.description,
        };
        this.actions.onSaveDocument(detail.content, metadata);
    };

    private readonly onArchiveDocument = (): void => {
        this.actions.queue({ kind: "archive" });
    };

    private readonly onFrameReady = (event: Event): void => {
        if (this.definition) {
            this.frames.handleReady((event as CustomEvent<SiteBlocFrameReadyDetail>).detail, this.definition);
        }
    };

    private setDefinition(definition: SiteBlocDefinition): void {
        this.definition = definition;
        this.view.setDefinition(definition);
        this.view.shell.setPageConfig({
            id: definition.id,
            title: definition.draft.name,
            path: definition.tag,
            description: definition.draft.description,
            tags: definition.draft.group ? [definition.draft.group] : [],
            published: definition.publishedRevision === definition.draftRevision,
        });
    }

    private dirty(): boolean {
        return this.frames.dirty;
    }

    private renderControls(): void {
        this.view.setControls({
            busy: this.busy,
            ready: this.frames.ready,
            dirty: this.dirty(),
            definition: this.definition,
        });
    }

    private fail(error: unknown, initial = true): void {
        this.busy = false;
        const message = error instanceof Error ? error.message : String(error);
        this.view.showError(message);
        this.view.setStatus(initial ? "Bloc failed to load." : "Action failed; draft remains open.");
        this.renderControls();
    }
}
