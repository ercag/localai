# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LocalAI is a VS Code extension built with TypeScript. The extension is in early development with a basic framework established.

## Build and Development Commands

- `npm run compile` - Compile TypeScript via Webpack
- `npm run watch` - Watch mode for development
- `npm run package` - Production build with minification
- `npm run lint` - Run ESLint on source files
- `npm test` - Run test suite (also runs compile-tests, compile, and lint)
- `npm run compile-tests` - Compile test files only
- `npm run watch-tests` - Watch mode for test compilation

## Debugging

Press F5 in VS Code to launch the extension in debug mode (Extension Development Host).

## Architecture

**Entry Point:** `src/extension.ts` exports `activate()` and `deactivate()` functions following the VS Code extension lifecycle.

**Build Pipeline:** TypeScript source in `src/` is bundled by Webpack into a single `dist/extension.js` file using CommonJS2 format.

**Test Structure:** Tests live in `src/test/` and compile to `out/test/`. Uses Mocha framework with @vscode/test-cli. Test files must match pattern `out/test/**/*.test.js`.

**Key Configuration:**
- `package.json` - Extension manifest, commands, and activation events
- `tsconfig.json` - TypeScript config with strict mode enabled
- `webpack.config.js` - Bundle configuration (externalizes vscode module)
- `eslint.config.mjs` - Linting rules
