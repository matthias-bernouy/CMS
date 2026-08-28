export function currentPageIdentifier(): string | null {
    return new URL(window.location.href).searchParams.get("id");
}
