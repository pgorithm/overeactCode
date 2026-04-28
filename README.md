# Overeact Code

VS Code extension with a side composer for Overeact Code.

## What is this

`Overeact Code` is a VS Code extension that adds a composer view in the Explorer and commands to open the composer and configure an OpenAI-compatible provider.

Main commands:

- `Overeact Code: Open`
- `Overeact Code: Configure Provider`
- `Overeact Code: Configure Provider API Key`

## Installation

### For development

1. Install [Node.js](https://nodejs.org/) (recommended LTS).
1. Install dependencies:

```bash
npm install
```

1. Build the extension:

```bash
npm run compile
```

## Run

### Run in VS Code (extension development mode)

1. Open this folder in VS Code.
1. Press `F5` (or Run and Debug -> `Run Extension`).
1. In the new Extension Development Host window:
   - open command palette (`Ctrl+Shift+P`);
   - run `Overeact Code: Open`.

### Run tests

```bash
npm test
```
