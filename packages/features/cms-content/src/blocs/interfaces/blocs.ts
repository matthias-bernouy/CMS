import type {
    BlocSettings,
    ManagedNativeElement,
    PageSlot,
    PageSlotAccept,
} from "cms-content/pages/interfaces/document";

export type BlocOwnership = { kind: "site-builder"; definitionId: string } | { kind: "code-managed" };

export type BlocFrameSandboxPermission =
    | "allow-downloads"
    | "allow-forms"
    | "allow-modals"
    | "allow-popups"
    | "allow-same-origin"
    | "allow-scripts";

export type BlocBrowserCapabilities = {
    readonly frames: {
        /** `self` or exact HTTPS origins; paths and wildcards are forbidden. */
        readonly origins: readonly string[];
        /** Exact union of sandbox permissions used by the Bloc's iframe elements. */
        readonly sandbox: readonly BlocFrameSandboxPermission[];
    };
};

export type TBloc = {
    id: string;
    /** Explicit rendering semantics; never inferred from the markup field. */
    kind: "component" | "composition";
    name: string;
    group: string;
    /** Optional stable order supplied by an external contribution catalogue. */
    catalogueOrder?: number;
    description: string;
    /** Optional authored image under the immutable package's assets/ directory. */
    thumbnail?: PresentationImage;
    /** Hidden resources remain renderable but are omitted from the authoring catalogue. */
    catalogue?: "listed" | "hidden";
    /** Explicit dependency closure seed for immutable contributed Blocs. */
    uses?: readonly string[];
    /** Allowed native tags for the element carrying `cms-bloc`. */
    root: ManagedNativeElement;
    /** Validated, fully scoped CSS ready to serve without JavaScript execution. */
    styleCSS?: string;
    /** Collection owning this immutable style fragment. */
    styleCollectionId?: string;
    viewJS: string;
    /** Fixed authored markup expanded according to `kind`. */
    markupHTML: string;
    /** Exact browser authority exercised by authored iframe elements. */
    browser?: BlocBrowserCapabilities;
    /** Initial page-owned children supplied when this bloc is inserted. */
    defaultContent?: string;
    /** Named Page-owned substitution slots offered by a contributed Bloc. */
    slots?: Readonly<Record<string, PageSlot>>;
    /** Declarative component attributes and insertion defaults supplied with the Bloc. */
    settings?: BlocSettings;
    ownership: BlocOwnership;
    /**
     * Author-side source folder, base64-encoded per relative path.
     * Optional source bundle retained for explicit resource export and
     * provenance.
     */
    source?: Record<string, string>;
};

export type PresentationImage = { path: string; alt?: string };

/** Code imports default to code-managed ownership when it is omitted. */
export type TBlocWrite = Omit<TBloc, "ownership"> & { ownership?: BlocOwnership };

export type SiteBlocNode =
    | { kind: "text"; value: string }
    | {
          kind: "bloc";
          tag: string;
          /** Native Page element carrying `cms-bloc` for component nodes. */
          root?: string;
          attributes: Record<string, string>;
          children: SiteBlocNode[];
      }
    | { kind: "slot"; slotId: string };

type SiteBlocSlotAccept = Extract<PageSlotAccept, { readonly kind: "component" | "any-component" }>;

/** A named editable region in a site-owned bloc definition. */
export type SiteBlocSlot = {
    id: string;
    label: string;
    slot?: string;
    min?: number;
    max?: number;
    accepts: SiteBlocSlotAccept[];
};

export type SiteBlocSnapshot = {
    name: string;
    group: string;
    description: string;
    structure: SiteBlocNode[];
    slots: SiteBlocSlot[];
    defaultContent: string;
    /** Derived from `structure`; callers must not use this as an authority. */
    dependencies: string[];
};

export type SiteBlocGroup = {
    icon?: "folder" | "layers" | "grid" | "layout" | "star" | "code";
    id: string;
    name: string;
    description: string;
};

export type SiteBlocDefinition = {
    /** Missing membership belongs to the default Site group. */
    groupId?: string;
    schema: "cms.site-bloc.v1";
    id: string;
    tag: string;
    ownership: Extract<BlocOwnership, { kind: "site-builder" }>;
    lifecycle: "active" | "archived";
    draftRevision: number;
    publishedRevision: number | null;
    draft: SiteBlocSnapshot;
    published: SiteBlocSnapshot | null;
    createdAt: Date;
    updatedAt: Date;
    archivedAt?: Date;
};

/** One globally unique aggregate per namespaced Bloc identifier. */
export type BlocRecord = {
    /** Immutable external contribution provenance, absent for local resources. */
    contributionId?: string;
    tag: string;
    ownership: BlocOwnership;
    /** The active compiled publication. Draft-only records have no artifact. */
    artifact: TBloc | null;
    siteDefinition?: SiteBlocDefinition;
};
