# Ink TODO

Interactive TODO CLI built with [Ink](https://www.npmjs.com/package/ink) (React for CLIs).
Same goal as [ink-notex](https://github.com/cutalion/ink-notex/), but created with the `gpt-5-codex` model.

## Demo

![Ink TODO demo](./demo.gif)

Watch the terminal cast on Asciinema: <https://asciinema.org/a/llI5x9F1NvSoflDv7Wcec6WLd>

## Install & Run

- Local run:
  - `npm install`
  - `npm start`
- As a command (link locally):
  - `npm link`
  - `ink-todo`

## Keys

- Up/Down or `j`/`k`: Navigate tasks (PageUp/PageDown, Home/End jump further)
- `space` or `enter`: Toggle the selected todo
- `a`: Add a todo · `e`: Edit · `d` / `Delete`: Remove
- `u` / `Ctrl+Z`: Undo · `r` / `Ctrl+Y` / `Shift+Ctrl+Z`: Redo
- `s`: Storage settings · `?`: Help overlay
- `q` or double `Ctrl+C`: Quit safely · `Esc`: Cancel input/close panels

## Highlights

- Autosaves after every change and shows Undo/Redo readiness plus storage info.
- Detail panel tracks created/completed timestamps for the focused todo.
- Built-in help (`?`) and settings panels keep navigation keyboard-first.
- Adjustable storage: switch between global and project scopes without leaving the TUI.

## Data

- Global storage: `~/.ink-notex/todos.json`
- Project storage: `./.ink-notex-todos.json`
- Config file: `~/.ink-notex/config.json` (remembers the last storage mode)
- Defaults to project mode when a project file exists, otherwise global.

## Notes

- Requires an interactive terminal; avoid piping input or running under CI.
- Status bar surfaces autosave issues—watch for red warnings if writes fail.
- Terminals without raw-mode support exit on a single `Ctrl+C`.

## Generation Notes

This project was generated in a single Codex CLI session using the `gpt-5-codex`
model.

- Prompt: `Create interactive terminal TODO-app using the Ink library (https://www.npmjs.com/package/ink)`
- Initial commit hash: `d2b3a845c396750d64f4ad33da4b794278ed13d6`
