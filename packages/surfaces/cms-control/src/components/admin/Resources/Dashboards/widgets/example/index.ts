import "../w-detail/WDetail";
import type { DashboardWDetail } from "../w-detail/WDetail";
import type { WDetailFieldValue } from "../w-detail/types";
import "../w-table/WTable";
import type { DashboardWTable } from "../w-table/WTable";
import { detailData, isMediaItems, isStringArray, PRODUCTS, tableData, type ExampleProduct } from "./data";

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
