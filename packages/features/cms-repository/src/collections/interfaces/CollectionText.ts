export interface CollectionText {
    readonly id: string;
    readonly label?: string;
    readonly description?: string;
    readonly category?: string;
    readonly group?: string;
    readonly values: Readonly<Record<string, string>>;
}

/** Site-owned values, stored separately from immutable collection releases. */
export type CollectionTextOverrides = Readonly<Record<string, Readonly<Record<string, string>>>>;

export interface ResolvedCollectionText {
    readonly key: string;
    readonly locale: string;
    readonly origin: "collection" | "site";
    readonly fallback: boolean;
    readonly value: string;
}
