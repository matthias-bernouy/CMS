/**
 * @bernouy/cms-control — view-side authoring entry point.
 *
 * This entry deliberately re-exports *only* the base classes needed to author
 * the view side of a bloc. Nothing editor-related is reachable from this
 * entry — even transitively — so
 * the bundle that visitors download never contains editor code.
 */
export {
    Component,
    Composition,
    type ComponentMetadata,
    type CompositionMetadata,
} from "@bernouy/components/base";
