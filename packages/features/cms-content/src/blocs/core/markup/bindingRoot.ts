/** Activate Bloc bindings at the rendered document boundary. */
export function wrapBindingCore(content: string): string {
    return `<cms-binding-core>${content}</cms-binding-core>`;
}
