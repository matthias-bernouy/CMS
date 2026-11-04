# Atlas starter authored bundle

`atlas.collection.json` defines a retained Light DOM panel and a composition-only Page assembly.
The page forwards its `main` substitution slot to the panel's `body` slot.
Only the panel has settings and styles; the page author fills editable content.

`preview.svg` is an immutable declared asset. Bundle admission verifies its
exact size and SHA-256 before producing the collection digest. It is not a
mutable file-library upload, provider file or remotely downloaded thumbnail.

```ts
import { admitCollectionReleaseJson } from "@bernouy/cms-repository/collections";

const admitted = await admitCollectionReleaseJson(documentJson, [
    { id: "preview", bytes: previewBytes },
]);
```

`packages/features/cms-repository/tests/collections/fixture.test.ts` loads these exact files. No provider,
credentials, network request, renderer or browser execution is involved.
The fixture includes administration translations, settings, two examples and
preview frames. Its example slot content is literal English and it has no theme
tokens or behavior. This low-level admission fixture is not the recommended
authoring-policy example; see the [authoring guide](../../../../../../docs/blocs/authoring.md)
for reusable content, translation and theme practices.
