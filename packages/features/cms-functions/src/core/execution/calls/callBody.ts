export async function readLimitedText(
    response: Response,
    maxBytes: number,
): Promise<{ text: string; truncated: boolean }> {
    if (!response.body) {
        return { text: "", truncated: false };
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let text = "";
    let bytes = 0;
    let truncated = false;
    while (true) {
        const { value, done } = await reader.read();
        if (done) {
            break;
        }
        bytes += value.byteLength;
        if (bytes > maxBytes) {
            const remaining = maxBytes - (bytes - value.byteLength);
            if (remaining > 0) {
                text += decoder.decode(value.slice(0, remaining), { stream: true });
            }
            truncated = true;
            await reader.cancel();
            break;
        }
        text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return { text, truncated };
}
