# Intelligent RTL Management for Obsidian

## Introduction

Intelligent RTL Management is an Obsidian plugin designed to provide advanced, granular control over text direction (Right-to-Left and Left-to-Right) throughout the Obsidian user interface and for individual notes. It features intelligent text-based direction detection to automatically adjust UI parts as needed.

## Features

*   **Contextual UI Mirroring:** Set default text directions (LTR, RTL, or Auto-Detect) for various UI components:
    *   Editor
    *   Left Sidebar
    *   Right Sidebar
    *   File Explorer
    *   Search Results Pane
    *   Tag Pane
    *   Individual Canvas Cards
*   **Advanced Text Detection ('Auto-Detect'):**
    *   When a UI component is set to 'Auto-Detect', the plugin analyzes its text content to determine the appropriate direction.
    *   The detection engine is heuristic-based, designed to handle common markdown syntax and skip irrelevant leading characters.
    *   The main editor dynamically updates its direction as you type if set to 'Auto-Detect'.
*   **Per-Note Overrides:**
    *   Override global or UI-specific direction settings for individual notes.
    *   Set a note's direction to LTR, RTL, or Auto-Detect using commands or front matter.
*   **Front Matter Integration:**
    *   Uses the `direction` key in a note's front matter.
    *   Example: `direction: rtl`
*   **Status Bar Indicator:**
    *   Displays the current direction context for the active note (e.g., "Dir: RTL (Note)" if overridden, "Dir: LTR (Default)" if using editor default).
    *   Click the status bar item to quickly cycle the active note's direction override (LTR → RTL → Auto → Clear Override).
*   **Dynamic Editor Updates:** Editors set to 'Auto-Detect' (either by general setting or per-note override) will have their text direction adjusted dynamically based on the content being typed or loaded.
*   **Canvas Card Support:** Text direction settings (including 'Auto-Detect') are applied to existing and newly created canvas cards.

## Installation

1.  Download `main.js`, `styles.css`, `manifest.json`, and `rtl-text-detector.js` from the latest release.
2.  In your Obsidian vault, navigate to the `.obsidian/plugins/` directory.
3.  Create a new folder named `hebrew-rtl-support` (this is the official ID from `manifest.json`).
4.  Place the downloaded files (`main.js`, `styles.css`, `manifest.json`, `rtl-text-detector.js`) into this newly created folder.
5.  Enable the "Intelligent RTL Management" plugin in Obsidian's community plugin settings.

## Usage

### Settings Panel

Access the plugin's settings via Obsidian's settings menu under "Intelligent RTL Management". Here you can:
*   Set the **Global Default Direction**: This is used when a UI container is set to 'Auto' and text detection doesn't yield a strong result, or when advanced detection is off.
*   Enable/Disable **Advanced Text Detection**.
*   Configure the default direction (LTR, RTL, or Auto-Detect) for each supported **UI Container** (Editor, Sidebars, File Explorer, etc.).

### Commands

The following commands are available via the command palette (Ctrl/Cmd+P):
*   **Set current note to RTL:** Overrides the current note's direction to RTL.
*   **Set current note to LTR:** Overrides the current note's direction to LTR.
*   **Set current note to Auto-Detect direction:** Sets the current note to use 'Auto-Detect' mode.
*   **Clear current note direction override:** Removes any specific direction override for the current note, reverting it to the general editor or global settings.

### Status Bar Item

*   Located in the bottom status bar.
*   Displays the current direction context of the active note (e.g., "Dir: RTL (Note)", "Dir: LTR (Default)").
*   Click the item to cycle the active note's direction override: LTR → RTL → Auto → Clear Override.

### Front Matter

To set a specific direction for a note directly in its content, use the `direction` key in the YAML front matter:

```yaml
---
direction: rtl
---

Your note content here...
```

Valid values for `direction` are `ltr`, `rtl`, or `auto`.

## Notes on 'Auto-Detect'

*   The 'Auto-Detect' feature uses a heuristic algorithm to determine text direction. While it attempts to be accurate (especially for text starting with strong RTL or LTR characters after skipping markdown), it may not be perfect in all complex mixed-language scenarios or with unusual formatting.
*   You can toggle the underlying "Advanced Text Detection" logic in the plugin's settings. If disabled, 'Auto' mode will primarily rely on the "Global Default Direction" setting.

## Troubleshooting/Feedback

If you encounter any issues or have suggestions for improvement, please report them via the plugin's GitHub repository issues page (if available).

## Author

AI Assistant (Jules)

## License

MIT License
