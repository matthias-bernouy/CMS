export type TextCapability = {
    format: "text" | "richtext";
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    link?: boolean;
    code?: boolean;
    color?: boolean;
    size?: boolean;
    align?: boolean;
    dynamic?: boolean;
};
