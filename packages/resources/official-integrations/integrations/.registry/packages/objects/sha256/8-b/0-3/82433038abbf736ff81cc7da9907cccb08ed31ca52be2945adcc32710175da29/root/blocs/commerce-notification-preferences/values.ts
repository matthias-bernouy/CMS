export function preference(value) {
    const item = value && typeof value === "object" ? value : {};
    return {
        key: String(item.key ?? ""),
        label: String(item.label ?? ""),
        description: String(item.description ?? ""),
        enabled: item.enabled === true,
        configurable: item.configurable === true,
    };
}

export function escapeHtml(value) {
    return value.replace(/[&<>"']/g, (character) => {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character] ?? character;
    });
}

export function cssEscape(value) {
    return globalThis.CSS?.escape ? globalThis.CSS.escape(value) : value.replace(/["\\]/g, "\\$&");
}

export function errorMessage(error) {
    console.error(error);
    return "Unable to update notification preferences.";
}
