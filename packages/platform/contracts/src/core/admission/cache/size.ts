/** Account for retained UTF-16 content and bounded structural overhead, not engine-specific RSS. */
export function retainedSize(value: unknown, maximum: number): number {
    const visited = new Set<object>();
    const remaining = [value];
    let bytes = 0;
    while (remaining.length) {
        const current = remaining.pop();
        if (typeof current === "string") {
            bytes += 24 + current.length * 2;
        } else if (current !== null && typeof current === "object" && !visited.has(current)) {
            visited.add(current);
            bytes += 64;
            for (const [key, child] of Object.entries(current)) {
                bytes += 24 + key.length * 2;
                remaining.push(child);
            }
        } else {
            bytes += 8;
        }
        if (bytes > maximum) {
            return bytes;
        }
    }
    return bytes;
}
