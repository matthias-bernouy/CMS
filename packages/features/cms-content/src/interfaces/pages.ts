export type PageIndexingConfiguration =
    | {
          mode: "disabled";
      }
    | {
          mode: "entity";
          /** Stable source and capability references; endpoint details remain owned by the source. */
          sourceUrn: string;
          entityId: string;
          /** Public page query parameter bound to the entity identity. */
          pageQueryParam: string;
          titleTemplate?: string;
          descriptionTemplate?: string;
      };

export type TPage = {
    id: string;
    /** path is unique */
    path: string;
    content: string;
    title: string;
    description: string;
    visible: boolean;
    tags: string[];
    /** Absent means that indexing has not been configured yet. */
    indexing?: PageIndexingConfiguration;
};

/**
 * Reference to a specific page by its primary key. `null` means "not set".
 */
export type TPageRef = { path: string } | null;
