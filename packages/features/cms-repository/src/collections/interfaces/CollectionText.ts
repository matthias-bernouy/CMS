export type TextParameterType = "string" | "number";
export type TextPluralCategory = "zero" | "one" | "two" | "few" | "many" | "other";
export type CollectionTextValue = string | (Partial<Record<TextPluralCategory, string>> & { other: string });

export interface CollectionText {
    readonly id: string;
    readonly parameters: Readonly<Record<string, TextParameterType>>;
    readonly plural?: string;
    readonly values: Readonly<Record<string, CollectionTextValue>>;
}

/** Site-owned values, stored separately from immutable collection releases. */
export type CollectionTextOverrides = Readonly<Record<string, Readonly<Record<string, CollectionTextValue>>>>;

export interface ResolvedCollectionText {
    readonly key: string;
    readonly locale: string;
    readonly origin: "collection" | "site";
    readonly fallback: boolean;
    readonly parameters: CollectionText["parameters"];
    readonly plural?: string;
    readonly value: CollectionTextValue;
}
