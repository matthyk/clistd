# `@clistd/recommend-rules` Design Guide

## Package purpose

`@clistd/recommend-rules` ships the maintained baseline of portable clistd
lint rules. It depends only on the public `@clistd/linter` API; it must not
import `@clistd/core`, CLI configuration, or framework adapter APIs.

## Rules

Export individual rules and the ordered `recommendedRules` collection. Rule
IDs are stable, package-qualified diagnostic codes. Keep rules portable: they
must express requirements of the canonical clistd document, not conventions of
a particular framework. Use `warn` as the default severity unless a document
cannot meaningfully satisfy the specification without the requirement.

Rules use the typed visitors supplied by `@clistd/linter`; do not traverse or
mutate the AST directly. Give every recommended rule actionable prompt text.

## Testing

Test this package through its public export and public linter types. Do not add
a direct `@clistd/core` dependency merely to construct test fixtures.
