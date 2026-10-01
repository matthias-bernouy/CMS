import type {
    CollectionComponentSettings,
    CollectionSlot,
    CollectionSlotAccept,
} from "@bernouy/cms-repository/collections";

export type BlocOwnership = { kind: "site-builder"; definitionId: string } | { kind: "code-managed" };

export type TBloc = {
    id: string;
    name: string;
    group: string;
    description: string;
    /** Optional authored image under the immutable package's assets/ directory. */
    thumbnail?: PresentationImage;
    /** Inactive collection resources remain renderable but are hidden from the authoring catalogue. */
    catalogue?: "active" | "inactive";
    /** Internal behavior component omitted from the authoring catalogue. */
    internal?: boolean;
    /** Single required native Light DOM child managed as part of this bloc. */
    nativeElement?: string;
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
    /** Named page-owned substitution slots offered by an installed collection bloc. */
    collectionSlots?: Readonly<Record<string, CollectionSlot>>;
    /** Declarative component attributes and insertion defaults from an installed collection. */
    collectionSettings?: CollectionComponentSettings;
    editorJS: string;
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

/** A named editable region in a site-owned bloc definition. */
export type SiteBlocSlot = {
    id: string;
    label: string;
    slot?: string;
    min?: number;
    max?: number;
    accepts: CollectionSlotAccept[];
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

export type SiteBlocCollection = {
    icon?: "folder" | "layers" | "grid" | "layout" | "star" | "code";
    id: string;
    name: string;
    description: string;
};

export type SiteBlocDefinition = {
    /** Missing membership belongs to the default Site collection. */
    collectionId?: string;
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
    /** Immutable installed collection provenance, absent for local resources. */
    collectionId?: string;
    tag: string;
    ownership: BlocOwnership;
    /** The active compiled publication. Draft-only records have no artifact. */
    artifact: TBloc | null;
    siteDefinition?: SiteBlocDefinition;
};
