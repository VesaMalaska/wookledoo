import sharp from "sharp";

export const presets = {
  thumbnail: { size: 320, quality: 82 },
  "full-size": { size: 1920, quality: 82 },
} as const;

export type Variant = keyof typeof presets;
export type TransformErrorCode = "unreadable" | "unsupported-format" | "multipage";

export class ImageTransformError extends Error {
  constructor(
    readonly code: TransformErrorCode,
    readonly sourcePath: string,
    detail: string,
    options?: ErrorOptions,
  ) {
    super(`Cannot transform "${sourcePath}": ${detail}`, options);
    this.name = "ImageTransformError";
  }
}

/** Validate a source without writing or encoding an output. */
export async function inspectImage(sourcePath: string): Promise<void> {
  let metadata;
  try {
    metadata = await sharp(sourcePath, { failOn: "error" }).metadata();
  } catch (error) {
    throw new ImageTransformError("unreadable", sourcePath, describeError(error), { cause: error });
  }

  if ((metadata.pages ?? 1) > 1 ||
      (metadata.pageHeight !== undefined && metadata.height !== undefined && metadata.pageHeight < metadata.height)) {
    throw new ImageTransformError("multipage", sourcePath, "animated or multipage images are not supported");
  }
  if (metadata.format !== "jpeg" && metadata.format !== "png" && metadata.format !== "webp") {
    throw new ImageTransformError("unsupported-format", sourcePath, `unsupported image format: ${metadata.format ?? "unknown"}`);
  }
}

/** Encode one still source as one WebP variant. The caller controls writes and concurrency. */
export async function transformImage(sourcePath: string, variant: Variant): Promise<Buffer> {
  await inspectImage(sourcePath);
  const { size, quality } = presets[variant];
  try {
    return await sharp(sourcePath, { failOn: "error" })
      .rotate()
      .resize(size, size, { fit: "inside", withoutEnlargement: true })
      .webp({ quality })
      .toBuffer();
  } catch (error) {
    throw new ImageTransformError("unreadable", sourcePath, describeError(error), { cause: error });
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
