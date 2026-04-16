import { execFile } from "node:child_process"
import { mkdir, readFile, unlink } from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

const IMAGE_DIR = ".opencode/clipboard-images"

function pickBaseDir(directory, worktree) {
  if (process.platform === "win32" && (!worktree || worktree === "/" || worktree === "\\")) {
    return directory
  }
  return worktree || directory || process.cwd()
}

async function saveClipboardImage(baseDir, nameArg) {
  if (process.platform !== "win32") {
    throw new Error("opencode-clipboard-ocr currently supports Windows clipboard only")
  }

  const outDir = path.join(baseDir, IMAGE_DIR)
  await mkdir(outDir, { recursive: true })

  const safeName = String(nameArg || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")

  const filename =
    (safeName && safeName.toLowerCase().endsWith(".png") ? safeName : safeName ? `${safeName}.png` : "") ||
    `clipboard-${new Date().toISOString().replace(/[:.]/g, "-")}.png`

  const outputPath = path.join(outDir, filename)

  const script = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Runtime.WindowsRuntime
if (-not [System.Windows.Forms.Clipboard]::ContainsImage()) {
  throw "Clipboard does not contain an image."
}
$img = [System.Windows.Forms.Clipboard]::GetImage()
$img.Save(${JSON.stringify(outputPath)}, [System.Drawing.Imaging.ImageFormat]::Png)
$basePath = ${JSON.stringify(outputPath)}
$baseDir = [System.IO.Path]::GetDirectoryName($basePath)
$stem = [System.IO.Path]::GetFileNameWithoutExtension($basePath)

function Save-OcrVariant([System.Drawing.Image]$source, [string]$path, [int]$scale, [bool]$invert) {
  $width = [Math]::Max(1, $source.Width * $scale)
  $height = [Math]::Max(1, $source.Height * $scale)
  $bitmap = New-Object System.Drawing.Bitmap($width, $height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
  $graphics.DrawImage($source, 0, 0, $width, $height)
  $graphics.Dispose()

  for ($y = 0; $y -lt $bitmap.Height; $y++) {
    for ($x = 0; $x -lt $bitmap.Width; $x++) {
      $pixel = $bitmap.GetPixel($x, $y)
      $gray = [int](($pixel.R * 0.299) + ($pixel.G * 0.587) + ($pixel.B * 0.114))
      if ($invert) { $gray = 255 - $gray }
      $gray = if ($gray -gt 145) { 255 } else { 0 }
      $bitmap.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($gray, $gray, $gray))
    }
  }

  $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bitmap.Dispose()
}

$variantSpecs = @(
  @{ Scale = 1; Invert = $false; Path = $basePath },
  @{ Scale = 2; Invert = $false; Path = [System.IO.Path]::Combine($baseDir, "$stem.ocr-x2-threshold.png") },
  @{ Scale = 2; Invert = $true; Path = [System.IO.Path]::Combine($baseDir, "$stem.ocr-x2-invert.png") },
  @{ Scale = 3; Invert = $false; Path = [System.IO.Path]::Combine($baseDir, "$stem.ocr-x3-threshold.png") }
)

$variantPaths = New-Object System.Collections.Generic.List[string]
foreach ($spec in $variantSpecs) {
  if ($spec.Scale -eq 1 -and -not $spec.Invert) {
    $variantPaths.Add($basePath)
  } else {
    Save-OcrVariant $img $spec.Path $spec.Scale $spec.Invert
    $variantPaths.Add($spec.Path)
  }
}

[Windows.Storage.StorageFile, Windows.Storage, ContentType=WindowsRuntime] | Out-Null
[Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType=WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType=WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.SoftwareBitmap, Windows.Graphics.Imaging, ContentType=WindowsRuntime] | Out-Null
[Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType=WindowsRuntime] | Out-Null
[Windows.Media.Ocr.OcrResult, Windows.Foundation, ContentType=WindowsRuntime] | Out-Null

function Await($op, [Type]$resultType) {
  $method = [System.WindowsRuntimeSystemExtensions].GetMethods() |
    Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 } |
    Select-Object -First 1
  $task = $method.MakeGenericMethod($resultType).Invoke($null, @($op))
  $task.Wait()
  return $task.Result
}

$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
if ($null -eq $engine) {
  throw "Windows OCR engine unavailable."
}

function Read-OcrText([string]$imagePath) {
  $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($imagePath)) ([Windows.Storage.StorageFile])
  $stream = Await ($file.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
  $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  $result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
  $stream.Dispose()
  return $result.Text
}

$bestText = ""
$bestPath = $basePath
$bestScore = -1
foreach ($variantPath in $variantPaths) {
  try {
    $text = (Read-OcrText $variantPath).Trim()
    $score = ($text -replace "\\s+", "").Length
    if ($score -gt $bestScore) {
      $bestScore = $score
      $bestText = $text
      $bestPath = $variantPath
    }
    if ($score -ge 20) { break }
  } catch {
    # Try next variant.
  }
}

$pathB64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($basePath))
$ocrPathB64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($bestPath))
$textB64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($bestText))
$variantB64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes(($variantPaths -join [Environment]::NewLine)))
Write-Output "PATH_B64=$pathB64"
Write-Output "OCR_PATH_B64=$ocrPathB64"
Write-Output "TEXT_B64=$textB64"
Write-Output "VARIANTS_B64=$variantB64"
`

  let stdout
  try {
    ;({ stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-Command", script],
      { windowsHide: true, maxBuffer: 1024 * 1024 },
    ))
  } catch (error) {
    const stderr = String(error.stderr || "")
    if (stderr.includes("Clipboard does not contain an image")) {
      throw new Error("Clipboard does not contain an image. Copy a screenshot/image first, then run /paste-image.")
    }
    throw error
  }

  const lines = stdout.split(/\r?\n/)
  const pathLine = lines.find((line) => line.startsWith("PATH_B64="))
  const textLine = lines.find((line) => line.startsWith("TEXT_B64="))
  const ocrPathLine = lines.find((line) => line.startsWith("OCR_PATH_B64="))
  const variantsLine = lines.find((line) => line.startsWith("VARIANTS_B64="))
  const savedPath = pathLine
    ? Buffer.from(pathLine.slice("PATH_B64=".length), "base64").toString("utf8")
    : outputPath
  const ocrPath = ocrPathLine
    ? Buffer.from(ocrPathLine.slice("OCR_PATH_B64=".length), "base64").toString("utf8")
    : savedPath
  const ocrText = textLine ? Buffer.from(textLine.slice("TEXT_B64=".length), "base64").toString("utf8").trim() : ""
  const buffer = await readFile(savedPath)
  const relativePath = path.relative(baseDir, savedPath)
  if (ocrPath !== savedPath) {
    await unlink(ocrPath).catch(() => {})
  }
  const variantPaths = variantsLine
    ? Buffer.from(variantsLine.slice("VARIANTS_B64=".length), "base64")
        .toString("utf8")
        .split(/\r?\n/)
        .filter(Boolean)
    : []
  await Promise.all(
    variantPaths
      .filter((variantPath) => variantPath !== savedPath)
      .map((variantPath) => unlink(variantPath).catch(() => {})),
  )

  return {
    path: savedPath,
    relativePath,
    filename: path.basename(savedPath),
    bytes: buffer.length,
    ocrText,
  }
}

export const ClipboardOcrPlugin = async ({ directory, worktree }) => {
  const baseDir = pickBaseDir(directory, worktree)

  return {
    "command.execute.before": async (input, output) => {
      if (input.command !== "paste-image") return

      const image = await saveClipboardImage(baseDir, input.arguments)
      const note = input.arguments?.trim()
      const ocrBlock = image.ocrText || "(no text detected)"
      const prompt = [
        "Answer the user using only this OCR text. Do not inspect files or run tools.",
        "",
        "Image Content:",
        "",
        "```text",
        ocrBlock,
        "```",
        note ? `\nUser request: ${note}` : "",
      ]
        .filter(Boolean)
        .join("\n")

      output.parts.splice(0, output.parts.length, { type: "text", text: prompt })
    },
  }
}
