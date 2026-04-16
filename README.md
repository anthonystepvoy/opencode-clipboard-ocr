# opencode-clipboard-ocr

Paste screenshot. Extract text locally. Send OCR to any OpenCode model.

`opencode-clipboard-ocr` lets OpenCode read text from clipboard screenshots without switching to a vision model. It uses Windows OCR locally, saves the screenshot for debugging, and sends only extracted text to your current model.

## What It Is

- Clipboard screenshot OCR for OpenCode.
- Good for image-based errors, terminal output, logs, and UI text.
- Works with text-only models like DeepSeek, Qwen, Llama, and local models.
- Does not send the image to the model.
- Does not require a vision model.

## Limits

- Windows-only for now.
- OCR is not visual understanding. It reads text, not diagrams/layout.
- OCR quality depends on screenshot clarity.
- OpenCode may briefly show a blank waiting state while the command hook runs OCR.

## Install

Clone this repo, then run:

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

Restart OpenCode.

## Usage

1. Copy a screenshot/image to the Windows clipboard.
2. In OpenCode, run:

```text
/paste-image what error is shown?
```

The model receives:

```text
Image Content:

<OCR text>
```

Your current OpenCode model stays active.

## Files

The plugin saves source screenshots under each project:

```text
.opencode/clipboard-images/
```

Add this to your project `.gitignore`:

```gitignore
.opencode/clipboard-images/
```

Temporary OCR variants are deleted after extraction.

## Uninstall

```powershell
powershell -ExecutionPolicy Bypass -File .\uninstall.ps1
```

## How It Works

OpenCode loads local/global plugins from:

```text
~/.config/opencode/plugins/
```

This installer copies:

```text
plugins/paste-image.js -> ~/.config/opencode/plugins/paste-image.js
commands/paste-image.md -> ~/.config/opencode/commands/paste-image.md
```

The command hook reads the Windows clipboard image, saves it as PNG, runs Windows OCR, preprocesses terminal screenshots with a few high-contrast variants, and replaces the command prompt with OCR text.
