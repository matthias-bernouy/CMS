# Content

Pages, publication, site Blocs, localization, themes and public delivery.

## Before using this contract

Use the exact contract selected on the site. Discover the available tool schemas before calling capabilities; a documentation link does not grant execution rights. Capabilities without an MCP binding are not MCP tools. Inherited capabilities retain their declaring contract and exact parent release.

## Capabilities

- `delivery.resolve-resource`: Resolve a bounded public path as a streamed HTTP resource. Representation headers are carried through the common request context, outside business input.
- `examples.get`: Read one generic example document with ordinary collection text references. It has no locale, theme, Page path or publication state.
- `examples.list`: Browse a bounded page of generic document examples from one installed collection. Examples have no routes or publication lifecycle.
- `localization.text.save`: Set or clear one locale override for one installed collection text.
- `localization.update`: Update the default, available and active site languages with revision control.
- `localization.texts.get`: Read and filter one installed collection's text catalogue for declarative administration.
- `localization.get`: Return the default, available and active site languages.
- `pages.create`: Create one Page draft with optional HTML content.
- `pages.delete`: Delete one Page with optimistic revision control.
- `pages.publish`: Publish or unpublish one Page with optimistic revision control.
- `pages.rename`: Rename one Page with optimistic revision control and naturally idempotent retries.
- `pages.update-route`: Update one localized Page route with optimistic revision control.
- `pages.update-seo`: Update localized Page search metadata with optimistic revision control.
- `pages.update`: Update Page content and metadata with optimistic revision control.
- `pages.editor-catalogue`: List the author-visible Blocs and bounded insertion metadata available to Pages.
- `pages.get`: Read one complete editable Page by stable identity.
- `pages.list`: List a bounded, stable Page batch for administration interfaces.
- `site.update`: Update site identity, availability and system Page references with revision control.
- `site.get`: Return site identity, availability and system Page references.
- `site-blocs.archive`: Archive a site-owned reusable composition.
- `site-blocs.create`: Create a draft site-owned reusable composition from validated Page markup.
- `site-blocs.publish`: Publish the current draft of a site-owned reusable composition.
- `site-blocs.restore`: Restore an archived site-owned reusable composition.
- `site-blocs.get`: Read one site-owned reusable composition.
- `site-blocs.list`: List site-owned reusable compositions.
- `theme.activate`: Activate one existing site theme profile.
- `theme.token.reset`: Remove one token override from one site theme profile and mode.
- `theme.token.save`: Set one token override on one site theme profile and mode.
- `theme.get`: Read a filtered collection theme workspace with resolved profile values.

## Errors and recovery

Branch on the declared error code. `error.output.message` explains a refusal in the language supported by the Provider; never parse translated copy to decide whether a retry is safe. Check the selected schema and retryability. After a revision conflict, reread current state and review changes before retrying. A transport failure may leave a mutation outcome unknown; inspect current state before repeating a non-idempotent command.

## Verify the result

Read back the affected resource using its owning contract, verify the requested state and inspect asynchronous operation details when a handle was returned. Report any checks that could not be performed. Diagnostic journal records help explain failures but are not durable business audit or proof of visual quality.


## Large resource catalogues

Content 1.1 exposes `localization.texts.read` and `theme.read` with the same inputs,
authorization and filters as the corresponding `*.get` operations, supporting up
to 8,192 texts and theme tokens. Existing getters retain their released output
bounds. Use the new operations when administering larger installed collections.
