export type PublishedPage = {
    id: string;
    path: string;
    title: string;
    description: string;
    content: string;
};

export async function sha256Hex(value: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function publishedPageContentHash(page: PublishedPage): Promise<string> {
    return sha256Hex(serializePublishedPage(page));
}

export function serializePublishedPage(page: PublishedPage): string {
    return JSON.stringify({
        id: page.id,
        path: page.path,
        title: page.title,
        description: page.description,
        content: page.content,
    });
}
