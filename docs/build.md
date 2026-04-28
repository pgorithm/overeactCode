# Build Automation

This project uses npm scripts for local builds and GitHub Actions for git-hosted automation.

## Local Build

Install dependencies once:

```bash
npm install
```

Compile the extension:

```bash
npm run compile
```

Run the test suite:

```bash
npm test
```

## Git Hooks

Husky is installed through the `prepare` npm script. After `npm install`, local git hooks run automatically:

- `pre-commit`: runs `npm run compile`
- `pre-push`: runs `npm run compile`

If a compile error occurs, the commit or push is blocked until the error is fixed.

## GitHub Actions

The workflow in `.github/workflows/build.yml` runs on every `push` and `pull_request`.

It performs these steps:

1. Checks out the repository.
1. Sets up Node.js 22 with npm cache.
1. Installs dependencies with `npm ci`.
1. Compiles the extension with `npm run compile`.
1. Runs tests with `xvfb-run -a npm test`.

`xvfb-run` is used because VS Code extension tests need a display server in the Linux CI environment.
