# Changesets

Changesets records the release intent for public package changes. Add one with
`npm run changeset` whenever a pull request changes a publishable package.

The release workflow combines pending changesets into a Version Packages pull
request, which is reviewed and merged when the release is ready.
