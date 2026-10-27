# Contributing

Thanks for your interest. This guide covers the dev loop, the test
setup, and the release flow.

If you're new to the project, the [README](./README.md) and
[docs/tracing.md](./docs/tracing.md) are better entry points than this
file.

## Local setup

This repo bundles its own pinned `convex-local-backend` binary so you
can deploy and exercise the component without a cloud Convex project.
The binary is downloaded into `.tools/` on first use.

```sh
pnpm install
pnpm local:start            # downloads the binary, writes .env.local,
                            # runs the backend on :3312 / :3313
```

## Day-to-day

In a second shell, with the backend from `pnpm local:start` running:

```sh
pnpm convex:codegen         # regenerate _generated/ for component + example
pnpm typecheck
pnpm test
pnpm lint
```

`pnpm check` runs all of the above (codegen + build + typecheck + test +
lint), but the codegen step requires a running local backend.

Keep `_generated/` directories committed. GitHub Actions is disabled on this
fork; run verification locally. Do not enable or dispatch hosted workflows.

## Tests

Run with `pnpm test`. Tests use [`convex-test`](https://www.npmjs.com/package/convex-test);
the `@smart-code-solutions/convex-evalbench/test` export registers the component schema so
host-side tests can exercise the real component functions. The two
`example/*-proof.mjs` scripts drive a real local backend end to end.

When you change behavior, update or add the matching test in the same
change.

## Documentation

User-facing changes need a docs update. Tracing behavior is documented
in [docs/tracing.md](./docs/tracing.md); new top-level concepts get a
new `docs/<concept>.md` plus a link from `README.md`.

## Commit messages

Follow [Conventional Commits](https://www.conventionalcommits.org): the
prefix drives the next version. `fix:` triggers a patch, `feat:` a
minor, and `feat!:` or a `BREAKING CHANGE:` footer a major bump. Other
types (`chore:`, `docs:`, `ci:`, `refactor:`) do not bump the version
and are hidden from the changelog by default.

## Releasing the scoped fork

Fork releases are manual. GitHub Actions is disabled; the inherited
release-please configuration does not publish this package.

1. Update the scoped package version and changelog, and review/merge the release
   changes into `main`. Preserve upstream attribution and the Apache-2.0 license.
2. On that exact revision, run `pnpm check` with the local backend running, then
   `pnpm build:dashboard` and the applicable `example/*-proof.mjs` checks.
3. Run `pnpm pack --out /absolute/path/to/release.tgz`. The `prepack` script rebuilds
   the package. Inspect the archive for exports, license and unexpected files;
   install the archive in a clean consumer and verify its types and component.
4. Authenticate with `npm login` using an account authorized for
   `@smart-code-solutions`, then publish the reviewed archive:
   `npm publish /absolute/path/to/release.tgz --access public --tag alpha`.
5. Verify the registry version, alpha dist-tag and tarball integrity, then install
   that exact version in the consumer and run its checks before deployment.

Alpha releases must retain the documented production-accounting limits. Do not
move the `latest` dist-tag or imply full screenshot coverage from this prerelease.
