# Documentation Blocs 1.0.0

Official documentation primitives for CmsCore websites.

The integration installs 29 editable blocs grouped around API reference,
callouts, code examples, rich content, navigation, and page utilities. It owns
bloc source only: it does not install a source, connector, dashboard, secret, or
site-specific content.

The package is versioned as an official integration. A site can re-run its
installation to force-refresh the owned bloc sources, while the integration
index provides stable and latest channels for future releases.

The `doc-search` and `doc-feedback` blocs emit events but do not impose a search
index or persistence provider. The `doc-math` and `doc-mermaid` blocs preserve
portable source text; a site may attach KaTeX or Mermaid rendering as a separate
enhancement. External embeds remain controlled by the URL and sandbox
baseline shipped by the bloc.
