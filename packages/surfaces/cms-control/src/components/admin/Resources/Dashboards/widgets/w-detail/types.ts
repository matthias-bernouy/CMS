import type { WidgetAction } from "../shared";
import type { DashboardMediaItem } from "../w-media-field/types";

export type WDetailFieldValue = string | string[] | DashboardMediaItem[];

export type WDetailField = {
    id: string;
    label: string;
    value: WDetailFieldValue;
    input: "text" | "textarea" | "select" | "combobox" | "tokens" | "chips" | "media-list" | "readonly" | "badge";
    options?: Array<{ label: string; value: string }>;
    placeholder?: string;
    creatable?: boolean;
    accept?: string;
};

export type WDetailSection = {
    title: string;
    description?: string;
    fields: WDetailField[];
};

export type WDetailData = {
    rowKey: string;
    eyebrow: string;
    title: string;
    status?: string;
    actions: WidgetAction[];
    main: WDetailSection[];
    aside: WDetailSection[];
};
