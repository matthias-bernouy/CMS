import "./w-table/WTable";
import "./w-detail/WDetail";
import type { DashboardWDetail } from "./w-detail/WDetail";
import type { DashboardWTable } from "./w-table/WTable";
import type { WDetailData, WDetailFieldValue } from "./w-detail/types";
import type { WTableData, WTableRow } from "./w-table/types";
import type { DashboardMediaItem } from "./w-media-field/types";

type ExampleProduct = {
    id: string;
    title: string;
    status: string;
    vendor: string;
    category: string;
    description: string;
    media: DashboardMediaItem[];
    tags: string[];
    visibility: string;
    updated: string;
};
const PRODUCTS: ExampleProduct[] = [
    product("prod_1001", "Racket Pro 300", "Active", "Babolat", "Tennis rackets", "Online store", "Today"),
    product("prod_1002", "Court Shoes Clay", "Draft", "Adidas", "Shoes", "Hidden", "Yesterday"),
    product("prod_1003", "Training Grip Pack", "Active", "Wilson", "Accessories", "Online store", "Jul 1"),
    product("prod_1004", "Junior Ball Basket", "Archived", "Head", "Training", "Hidden", "Jun 28"),
];
export function mountDashboardWidgetExample(root: HTMLElement, selectedId: string | null): void {
    root.replaceChildren();
    const selected = selectedId ? (PRODUCTS.find((item) => item.id === selectedId) ?? null) : null;
    root.append(selected ? detailElement(selected) : tableElement());
}

export function updateDashboardWidgetExampleField(rowKey: string, field: string, value: WDetailFieldValue): void {
    const product = PRODUCTS.find((item) => item.id === rowKey);
    if (!product) {
        return;
    }
    if (field === "title" && typeof value === "string") {
        product.title = value;
    }
    if (field === "status" && typeof value === "string") {
        product.status = value;
    }
    if (field === "vendor" && typeof value === "string") {
        product.vendor = value;
    }
    if (field === "category" && typeof value === "string") {
        product.category = value;
    }
    if (field === "description" && typeof value === "string") {
        product.description = value;
    }
    if (field === "visibility" && typeof value === "string") {
        product.visibility = value;
    }
    if (field === "tags" && isStringArray(value)) {
        product.tags = value;
    }
    if (field === "media" && isMediaItems(value)) {
        product.media = value;
    }
}
function tableElement(): DashboardWTable {
    const element = document.createElement("cms-dashboard-w-table") as unknown as DashboardWTable;
    element.data = tableData();
    return element;
}

function detailElement(product: ExampleProduct): DashboardWDetail {
    const element = document.createElement("cms-dashboard-w-detail") as unknown as DashboardWDetail;
    element.data = detailData(product);
    return element;
}

function tableData(): WTableData {
    return {
        title: "Products",
        subtitle: "Widget sandbox: selection and bulk checkboxes only.",
        columns: [
            { key: "title", label: "Product", primary: true },
            { key: "status", label: "Status", width: "140px" },
            { key: "vendor", label: "Vendor", width: "160px" },
            { key: "category", label: "Category", width: "180px" },
            { key: "updated", label: "Updated", width: "140px" },
        ],
        rows: PRODUCTS.map(tableRow),
    };
}

function tableRow(product: ExampleProduct): WTableRow {
    return {
        id: product.id,
        collection: "example-products",
        cells: {
            title: { title: product.title, meta: product.id },
            status: { title: product.status, tone: "badge" },
            vendor: product.vendor,
            category: product.category,
            updated: { title: product.updated, tone: "muted" },
        },
    };
}

function detailData(product: ExampleProduct): WDetailData {
    return {
        rowKey: product.id,
        eyebrow: "Product",
        title: product.title,
        status: product.status,
        actions: [
            { label: "Save changes", tone: "primary", action: "save" },
            { label: "Duplicate", action: "duplicate" },
            { label: "Preview", action: "preview" },
            { label: "Copy link", action: "copy-link", section: "Share", icon: "link" },
            { label: "Export", action: "export", section: "Share", icon: "download" },
            { label: "Archive product", tone: "danger", action: "archive", section: "Other actions", icon: "archive" },
            { label: "Delete product", tone: "danger", action: "delete", section: "Other actions", icon: "trash" },
        ],
        main: [
            {
                title: "General",
                fields: [
                    { id: "title", label: "Title", input: "text", value: product.title },
                    { id: "description", label: "Description", input: "textarea", value: product.description },
                    { id: "media", label: "Media", input: "media-list", value: product.media, accept: "image/*" },
                    { id: "category", label: "Category", input: "text", value: product.category },
                ],
            },
        ],
        aside: [
            {
                title: "Status",
                fields: [
                    {
                        id: "status",
                        label: "Publication",
                        input: "select",
                        value: product.status,
                        options: options("Active", "Draft", "Archived"),
                    },
                    {
                        id: "visibility",
                        label: "Visibility",
                        input: "select",
                        value: product.visibility,
                        options: options("Online store", "Hidden"),
                    },
                ],
            },
            {
                title: "Organization",
                fields: [
                    {
                        id: "vendor",
                        label: "Vendor",
                        input: "combobox",
                        value: product.vendor,
                        options: options("Adidas", "Nike", "Section Making"),
                        placeholder: "Search or add a vendor",
                        creatable: true,
                    },
                    {
                        id: "tags",
                        label: "Tags",
                        input: "tokens",
                        value: product.tags,
                        options: options("Sport", "Featured", "Training"),
                        placeholder: "Search or add tags",
                        creatable: true,
                    },
                    { id: "id", label: "Resource id", input: "readonly", value: product.id },
                ],
            },
        ],
    };
}

function product(
    id: string,
    title: string,
    status: string,
    vendor: string,
    category: string,
    visibility: string,
    updated: string,
): ExampleProduct {
    return {
        id,
        title,
        status,
        vendor,
        category,
        visibility,
        updated,
        description: "Editable sandbox content before any data source is wired.",
        media: media(id, title),
        tags: ["Sport", "Featured"],
    };
}
function options(...values: string[]): Array<{ label: string; value: string }> {
    return values.map((value) => ({ label: value, value }));
}
function media(id: string, title: string): DashboardMediaItem[] {
    return [
        {
            id: `${id}_media_1`,
            url: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=420&q=80",
            alt: `${title} media`,
        },
    ];
}
function isStringArray(value: WDetailFieldValue): value is string[] {
    return Array.isArray(value) && value.every((item) => typeof item === "string");
}
function isMediaItems(value: WDetailFieldValue): value is DashboardMediaItem[] {
    return Array.isArray(value) && value.every((item) => typeof item === "object" && item !== null && "url" in item);
}
