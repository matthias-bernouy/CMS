export const mediaBucket = "products-media";
export const maxMediaBytes = 10 * 1024 * 1024;

export const mediaContentTypes = new Map<string, string>([
    ["image/jpeg", ".jpg"],
    ["image/png", ".png"],
    ["image/webp", ".webp"],
    ["image/gif", ".gif"],
    ["image/avif", ".avif"],
]);
