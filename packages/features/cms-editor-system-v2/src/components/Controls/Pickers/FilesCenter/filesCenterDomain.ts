import type { MediaAccept } from "@bernouy/cms-content/editor";

export type FileItem = {
    id: string;
    name: string;
    parentId: string | null;
    type: "folder" | "file";
    size?: number;
    mimeType?: string;
    contentHash?: string;
};

export type FilesPage = {
    items: FileItem[];
};

export type BreadcrumbEntry = {
    id: string | null;
    label: string;
};

export type FilesCenterFileAccept = MediaAccept;

export type FilesCenterSelectDetail = {
    id: string;
    label: string;
    src: string;
    mimeType?: string;
};

export function fileUrl(basePath: string, id: string): string {
    return `${basePath}/.cms/files/by-id/${encodeURIComponent(id)}`;
}

export function fileDetail(basePath: string, item: FileItem): FilesCenterSelectDetail {
    return {
        id: item.id,
        label: item.name,
        src: fileUrl(basePath, item.id),
        mimeType: item.mimeType,
    };
}

export function fileKind(item: FileItem): "image" | "pdf" | "file" {
    if (item.mimeType?.startsWith("image/")) return "image";
    if (item.mimeType?.includes("pdf")) return "pdf";
    return "file";
}

export function matchesFileAccept(item: FileItem, accept: FilesCenterFileAccept[] | null): boolean {
    if (!accept || accept.length === 0) return true;

    const mimeType = item.mimeType ?? "";
    if (accept.includes("image") && mimeType.startsWith("image/")) return true;
    if (accept.includes("svg") && mimeType === "image/svg+xml") return true;
    if (accept.includes("bitmap") && mimeType.startsWith("image/") && mimeType !== "image/svg+xml") return true;
    if (accept.includes("video") && mimeType.startsWith("video/")) return true;
    if (accept.includes("audio") && mimeType.startsWith("audio/")) return true;
    if (accept.includes("document") && !mimeType.startsWith("image/") && !mimeType.startsWith("video/") && !mimeType.startsWith("audio/")) return true;
    return false;
}

export function fileMeta(item: FileItem): string {
    const parts = [item.mimeType ?? "File"];
    if (typeof item.size === "number") parts.push(formatFileSize(item.size));
    return parts.join(" · ");
}

export function formatFileSize(size: number): string {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
    return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
