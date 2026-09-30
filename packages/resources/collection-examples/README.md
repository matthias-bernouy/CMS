# @bernouy/collection-examples

Trusted declarative examples for collection admission and server rendering. `src/texts.json`
contains checkout translations and `src/checkout.html` is the actual composition.
`src/index.ts` assembles the release and validates the JSON text catalogue; it
contains no translation literals, renderer, routes or persistence adapter.

The admission test verifies the composition against `ulvia-collection/v1`.
See [collection texts](../../../docs/blocs/texts.md) for the supported format,
server rendering and current limitations.
