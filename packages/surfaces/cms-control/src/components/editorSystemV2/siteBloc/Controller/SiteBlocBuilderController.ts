import type { SiteBlocDefinition } from "@bernouy/cms-content";
import type { EditorCatalogEntry } from "@bernouy/cms-content/editor";
import { EDITOR_V2_SAVE_DOCUMENT_EVENT, type EditorV2SaveDocumentDetail } from "@bernouy/cms-editor-system-v2";
import { configureShellCatalogAndFrame } from "../../shellSetup";
import { loadBlocCatalogue, loadSiteBloc, type BlocCatalogueItem, type SiteBlocMode } from "../siteBlocApi";
import { SiteBlocView } from "../siteBlocView";
import { SiteBlocActions, type SiteBlocBuilderAction } from "./siteBlocActions";
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
            configureMode: (mode) => this.configureMode(mode),
            renderControls: () => this.renderControls(),
            fail: (error) => this.fail(error, false),
        });
        root.addEventListener("click", this.onClick);
        root.addEventListener("input", this.onInput);
        root.addEventListener("keydown", this.onKeyDown);
        this.view.shell.addEventListener(EDITOR_V2_SAVE_DOCUMENT_EVENT, this.onSaveDocument);
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
            await this.view.simplifyShellChrome();
            const [definition, catalogue] = await Promise.all([
                loadSiteBloc(tag),
                loadBlocCatalogue(),
                configureShellCatalogAndFrame(this.view.shell, { frame: false }),
            ]);
            this.catalogue = catalogue;
            this.baseCatalog = [...this.view.shell.catalog];
            this.setDefinition(definition);
            this.busy = false;
            this.configureMode("structure");
        } catch (error) {
            this.fail(error);
        }
    }

    private configureMode(mode: SiteBlocMode): void {
        if (this.definition) {
            this.frames.configure(mode, this.definition, this.catalogue, this.baseCatalog);
        }
    }

    private readonly onClick = (event: Event): void => {
        const button = (event.target as Element | null)?.closest<HTMLButtonElement>("button");
        if (!button) {
            return;
        }
        const mode = button.dataset.mode;
        if (mode === "structure" || mode === "default") {
            this.actions.queue({ kind: "switch", mode });
            return;
        }
        const action = button.dataset.action;
        if (action === "details") {
            this.view.openDetails();
        } else if (action === "close-details") {
            this.view.closeDetails();
        } else if (action === "save" || action === "preview" || action === "publish" || action === "archive") {
            this.actions.queue({ kind: action } satisfies SiteBlocBuilderAction);
        }
    };

    private readonly onInput = (event: Event): void => {
        if (!(event.target as Element | null)?.closest("[data-field]")) {
            return;
        }
        this.view.setStatus("Unsaved metadata changes");
        this.renderControls();
    };

    private readonly onKeyDown = (event: Event): void => {
        if ((event as KeyboardEvent).key === "Escape" && this.view.detailsOpen()) {
            this.view.closeDetails();
        }
    };

    private readonly onSaveDocument = (event: Event): void => {
        const detail = (event as CustomEvent<EditorV2SaveDocumentDetail>).detail;
        this.actions.onSaveDocument(detail.content);
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
        const draft = this.definition?.draft;
        const metadata = this.view.metadata();
        return Boolean(
            this.frames.dirty ||
                !draft ||
                metadata.name !== draft.name ||
                metadata.group !== draft.group ||
                metadata.description !== draft.description,
        );
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
