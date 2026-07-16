export type WTableCell = string | {
    title: string;
    meta?: string;
    tone?: "default" | "muted" | "badge";
};

export type WTableColumn = {
    key: string;
    label: string;
    width?: string;
    primary?: boolean;
};

export type WTableRow = {
    id: string;
    collection: string;
    cells: Record<string, WTableCell>;
};

export type WTableData = {
    title: string;
    subtitle?: string;
    actions?: Array<{
        label: string;
        action: string;
        widget?: string;
        target?: string;
        tone?: "primary" | "secondary" | "danger";
        confirm?: string;
    }>;
    columns: WTableColumn[];
    rows: WTableRow[];
};
