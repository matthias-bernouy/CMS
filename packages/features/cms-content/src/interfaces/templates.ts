export type TTemplate = {
    id: string;
    /** Stable slug — primary handle for the CLI / file-system mapping. Immutable. */
    identifier: string;
    name: string;
    description: string;
    content: string;
    category: string;
    createdAt: Date;
}
