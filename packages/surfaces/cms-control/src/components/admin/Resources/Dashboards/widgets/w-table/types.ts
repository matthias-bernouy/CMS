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

export type WTableOption = {
    label: string;
    value: string;
};

export type WTableData = {
    title: string;
    subtitle?: string;
    columns: WTableColumn[];
    rows: WTableRow[];
    statusOptions: WTableOption[];
    sortOptions: WTableOption[];
};
