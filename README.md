# Ink TODO

Interactive terminal TODO app built with [Ink](https://www.npmjs.com/package/ink).

## Setup

```sh
npm install
```

## Run

```sh
npm start
```

Once running in a TTY, use the following keys:

- `a` start adding a new task
- Arrow keys or `j`/`k` to move the selection
- `space` or `enter` to toggle completion
- `d` to delete the highlighted task
- `q` (or `Ctrl+C`) to exit
- `Esc` cancels task creation while typing

Tip: the command must be run inside an interactive terminal. Avoid piping input
or running under `npm test`/CI, as Ink requires TTY support for raw mode.

## Generation Notes

This project was generated in a single Codex CLI session using the `gpt-5-codex`
model.

- Prompt: `Create interactive terminal TODO-app using the Ink library (https://www.npmjs.com/package/ink)`
- Initial commit hash: `<pending>`
