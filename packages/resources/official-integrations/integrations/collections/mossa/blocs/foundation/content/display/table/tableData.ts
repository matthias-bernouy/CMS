export type TableData = {
    columns: string[];
    rows: string[][];
};

const MAX_COLUMNS = 12;
const MAX_ROWS = 200;
const MAX_CELL_LENGTH = 4_000;

export function parseTableData(columnsValue: string | null, rowsValue: string | null): TableData | null {
    try {
        const columns = JSON.parse(columnsValue ?? "[]") as unknown;
        const rows = JSON.parse(rowsValue ?? "[]") as unknown;
        if (!validColumns(columns) || !validRows(rows, columns.length)) {
            return null;
        }
        return { columns, rows };
    } catch {
        return null;
    }
}

function validColumns(value: unknown): value is string[] {
    return Array.isArray(value) && value.length > 0 && value.length <= MAX_COLUMNS && value.every(validCell);
}

function validRows(value: unknown, columnCount: number): value is string[][] {
    return (
        Array.isArray(value) &&
        value.length <= MAX_ROWS &&
        value.every((row) => Array.isArray(row) && row.length === columnCount && row.every(validCell))
    );
}

function validCell(value: unknown): value is string {
    return typeof value === "string" && value.length <= MAX_CELL_LENGTH;
}
