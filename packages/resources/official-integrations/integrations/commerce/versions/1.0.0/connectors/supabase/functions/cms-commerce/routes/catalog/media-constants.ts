export const productMediaBucket = "commerce-media";
export const maxProductImageBytes = 10 * 1024 * 1024;

export const productImageTypes = new Map<string, string>([
    ["image/jpeg", ".jpg"],
    ["image/png", ".png"],
    ["image/webp", ".webp"],
    ["image/gif", ".gif"],
    ["image/avif", ".avif"],
]);
