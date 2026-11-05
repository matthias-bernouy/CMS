# Review rendered page design

Use this review after a Page or shared Bloc changes. Start with
[recorded-state and structural verification](verify.md). This procedure requires
an authorized browser or equivalent rendering tool for its visual checks.

## Establish the review target

Record the Page route and revision, relevant collection releases, viewport,
locale and active theme mode. Inspect the saved draft through an authorized
session. A draft's public 404 response does not describe its rendered layout.

For a general website, begin at narrow, intermediate and wide widths, such as
390, 768 and 1440 CSS pixels. Use additional sizes when the audience or an
observed layout transition requires them. Inspect the entire Page and relevant
interactive states, rather than only its first screen.

## Evaluate the actual result

- **Purpose:** can a reader identify the primary message and useful next action?
  Does the Page contain the required information and accurate product claims?
- **Composition:** are emphasis, grouping, alignment and spacing deliberate?
  Does each section earn its space and support the reading sequence?
- **Typography:** are text, code and controls legible? Check body measure,
  heading wraps, clipped characters and unusually long content.
- **Color:** measure text contrast against the actual background, including
  states and themes. Use at least 4.5:1 for ordinary text and 3:1 for large text
  as review targets; inspect focus and control boundaries as well.
- **Responsive layout:** check horizontal overflow, images, menus, tables and
  code blocks. Content must remain available as text grows or columns collapse.
- **Interaction:** exercise navigation, relevant keyboard flows and visible
  focus. Check touch access, disabled/error states and reduced motion where
  applicable. Keep tests within the authorized business actions.
- **Specificity:** does the content and visual treatment explain this product?
  Remove decorative effects or repeated sections that weaken that explanation.

Use real text and, where safe, preview content with long titles, missing optional
images and empty or varied repeated items. Do not mutate unrelated business
records to stage a screenshot. Do not use generated mockups as evidence of the
browser result.

## Correct and verify

For each finding record its location, observed behavior, expected result and
smallest responsible resource. Fix clipped or inaccessible content, broken
actions and unreadable text before accepting the design. Recheck affected
viewports, themes and other Pages that use a changed shared Bloc.

Treat screenshots, structural diagnostics and interaction results as distinct
evidence. Automated measurements can identify defects; a composition and content
review still requires inspecting the result. Report unperformed checks clearly.

If the available tools cannot preview an unpublished collection preparation,
leave it unpublished and report the missing preview capability. Publishing or
installing a release solely to obtain a screenshot requires the corresponding
authorization; this guide grants none.

## Completion evidence

Report the saved state, widths and modes actually inspected, tested interactions,
corrected findings and remaining limitations. Include real captures when the
client supports them. Avoid numerical taste scores as substitutes for concrete
observations. Keep publication status explicit.
