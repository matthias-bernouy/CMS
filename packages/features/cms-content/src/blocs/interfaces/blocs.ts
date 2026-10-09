import type {
    BlocSettings,
    ManagedNativeElement,
    PageSlot,
    PageSlotAccept,
    PageSurface,
} from "cms-content/pages/interfaces/document";

export type BlocOwnership = { kind: "site-builder"; definitionId: string } | { kind: "code-managed" };

export type TBloc = {
    id: string;
    name: string;
    group: string;
    /** Optional stable order supplied by an external contribution catalogue. */
    catalogueOrder?: number;
    description: string;
    /** Optional authored image under the immutable package's assets/ directory. */
    thumbnail?: PresentationImage;
    /** Inactive contributed resources remain renderable but are hidden from the authoring catalogue. */
    catalogue?: "active" | "inactive";
    /** Internal behavior component omitted from the authoring catalogue. */
    internal?: boolean;
    /** Omission for legacy/local Blocs means both rendering surfaces. */
    surfaces?: readonly PageSurface[];
    /** Explicit dependency closure seed for immutable contributed Blocs. */
    uses?: readonly string[];
    /** Allowed tags for the single required native Light DOM child. */
    nativeElement?: ManagedNativeElement;
    viewJS: string;
    /**
     * Server-rendered light-DOM template. A bloc carrying this field is a
     * composition: its authored host is expanded before delivery and it does
     * not need a client custom-element definition of its own.
     */
    compositionHTML?: string;
    /** Fixed Light DOM owned by a component whose custom-element host survives rendering. */
    componentHTML?: string;
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

/** One globally unique aggregate per custom-element tag. */
export type BlocRecord = {
    /** Immutable external contribution provenance, absent for local resources. */
    contributionId?: string;
    tag: string;
    ownership: BlocOwnership;
    /** The active compiled publication. Draft-only records have no artifact. */
    artifact: TBloc | null;
    siteDefinition?: SiteBlocDefinition;
};
