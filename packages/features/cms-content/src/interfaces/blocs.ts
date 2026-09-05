import type { ContentSlot } from "cms-content/interfaces/Editor/document/ContentSlots";

export type BlocOwnership =
    | { kind: "site-builder"; definitionId: string }
    | { kind: "code-managed" }
    | {
          kind: "integration";
          integrationKind: string;
          installationId: string;
          definitionVersion: string;
      };

export type TBloc = {
    id: string;
    name: string;
    group: string;
    description: string;
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
    editorJS: string;
    ownership: BlocOwnership;
    /**
     * Author-side source folder, base64-encoded per relative path.
     * Optional source bundle retained for explicit resource export and
     * provenance.
     */
    source?: Record<string, string>;
};

/**
 * Backward-compatible write shape. Existing importers that predate explicit
 * ownership are treated as code-managed writers at the repository boundary.
 */
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

export type SiteBlocSlot = ContentSlot & { id: string };

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

export type SiteBlocDefinition = {
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
    tag: string;
    ownership: BlocOwnership;
    /**
     * One-shot migration state for pre-ownership flat Mongo documents. It is
     * consumed by the first explicit code or integration write and is never
     * created for modern aggregates.
     */
    legacyOwnershipClaim?: "unclaimed";
    /** The active compiled publication. Draft-only records have no artifact. */
    artifact: TBloc | null;
    siteDefinition?: SiteBlocDefinition;
};
