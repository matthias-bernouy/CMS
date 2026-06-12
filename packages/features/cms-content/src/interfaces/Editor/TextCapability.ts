export type TextCapability = {
    format: "text" | "richtext";
    bold?: boolean;
    italic?: boolean;
    link?: boolean;
    code?: boolean;
    dynamic?: boolean;
};
