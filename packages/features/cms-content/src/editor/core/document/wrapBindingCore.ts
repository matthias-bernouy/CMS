/** Activate the shared binding runtime at the document boundary. */
export function wrapBindingCore(content: string): string {
    return `<cms-binding-core>${content}</cms-binding-core>`;
}
