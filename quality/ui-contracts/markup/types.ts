export type MarkupFragment = {
    content: string;
    positions: number[];
};

export type MarkupAttribute = {
    value: string;
    offset: number;
};

export type MarkupTag = {
    name: string;
    offset: number;
    attributes: Map<string, MarkupAttribute>;
};

/** Unknown script expressions must not become evidence for a literal contract. */
export const DYNAMIC_VALUE = "\uE000";
