/** Collection-owned Control HTML. Rendering and access belong to the site. */
export interface CollectionView {
    readonly id: string;
    readonly name: string;
    readonly icon?: string;
    readonly description?: string;
    readonly html: string;
}
