# Fork dependency compatibility

The fork's development stack uses Convex 1.48.0, Convex Agent 0.7.8, AI SDK
7.0.154, and the Anthropic provider 4.0.89. Node.js 22 or newer is required for
the current Agent. The existing compiler and test-runner major versions are
retained; dependency refresh does not require migrating those toolchains.

The tracing core still has no runtime dependency on Agent or AI SDK. Optional
peer ranges accept AI SDK 6/7 and Agent 0.6/0.7. Choose compatible pairs in the
host: Agent 0.6 with SDK 6, or Agent 0.7 with SDK 7 and v4 provider packages.
Broad peer ranges do not make a mixed Agent/SDK pair compatible.

## Verified adapter boundaries

The same middleware is exercised through the real `generateText`, `streamText`,
and `wrapLanguageModel` APIs in AI SDK 6.0.316 and 7.0.154. SDK 7 explicitly
accepts the v3 middleware shape, so no parallel adapter API or version flag was
added. Tests check output and exactly one persisted span with final token usage.
An actual Agent 0.7.8 generation with an SDK test model checks the existing host
usage hook and parent/child trace correlation. These are deterministic tests,
not live-provider or production evidence.

## Agent constructor declaration patch

Agent 0.7.8 intersects `Config.languageModel` with another large SDK model union
in its constructor. A minimal consumer triggers TypeScript TS2590 with both
TypeScript 5.9 and 7.0.2. The version-specific pnpm patch removes that redundant
intersection and requires `NonNullable<Config["languageModel"]>` instead.
Its source and published declarations match; JavaScript is unchanged. A static
test verifies that the patch still rejects SDK 6 models for the SDK 7 Agent.

`pnpm install` in this fork applies the patch via `pnpm-workspace.yaml`. A host
installing the component package does **not** inherit this workspace patch. A
host using affected Agent 0.7.8 constructor types may need the same patch until
upstream fixes the declaration. The patch is included in the package under
`patches/` and in this repository. This is a known compatibility limit, not a
runtime observability feature.

## Verification and release scope

Use the repository's existing local setup and checks in CONTRIBUTING.md. GitHub
Actions execution is disabled on this fork; scoped alpha releases are manual.
Updating dependencies does not establish tenant isolation, complete financial
accounting, or the missing metrics in [the coverage map](metrics-coverage.md).
