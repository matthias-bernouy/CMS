# Ulvia Official showcases

These HTML fragments are reproducible Delivery pages for manual UI, responsive
container and accessibility reviews. They use only public collection Blocs and
keep the native `form` element page-owned.

The two `assets/showcase-*.svg` files are site-owned demonstration media, not
collection assets. A live installer uploads them as public workspace files and
replaces the matching symbolic file references in `site-home.html` with the
immutable URLs returned by the Files contract.

- `forms-catalogue.html` presents every form primitive and composition.
- `contact-form.html` demonstrates a realistic responsive contact form with
  semantic fieldset sections.
- `layouts-catalogue.html` presents the collection release overview.
- `layouts-components.html` demonstrates the composition primitives.
- `layouts-theme.html` previews the semantic token system through real blocks.
- `layouts-details.html` demonstrates structured editor and asset-review shells.

The four layout pages share the same application shell, use native links for
route navigation and expose exactly one current page in each navigation level.
Below the shell's compact breakpoint, both lateral navigations become labelled,
mutually exclusive drawers instead of horizontal link strips.

Review the live Delivery pages at desktop and narrow container widths. Static
captures are deliberately not the source of truth because the collection evolves.

The form showcases deliberately expose non-submitting controls. They review the
official field, choice, layout and feedback Blocs without selecting an external
Forms contract or pretending that a submission succeeded.
