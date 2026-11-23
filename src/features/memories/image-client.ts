"use client";

export interface OptimizedImageResult {
  optimizedFile: File;
  thumbnailFile: File | null;
  width: number | null;
  height: number | null;
}

function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mimeType, quality);
  });
}

async function resizeImageToFile(
  img: HTMLImageElement,
  maxEdge: number,
  filename: string,
  quality: number
): Promise<{ file: File; width: number; height: number } | null> {
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.drawImage(img, 0, 0, width, height);
  const blob = await canvasToBlob(canvas, "image/webp", quality);
  if (!blob) return null;

  return {
    file: new File([blob], filename.replace(/\.[^.]+$/, "") + ".webp", {
      type: "image/webp",
    }),
    width,
    height,
  };
}

/**
 * Optimizes large photos (max 1920px) and generates a 480px thumbnail before upload.
 * Falls back safely to the original file for animated GIFs or unsupported browsers.
 */
export async function optimizePhotoForUpload(
  file: File
): Promise<OptimizedImageResult> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") {
    return {
      optimizedFile: file,
      thumbnailFile: null,
      width: null,
      height: null,
    };
  }

  try {
    const img = await loadImageElement(file);
    const [fullRes, thumbRes] = await Promise.all([
      resizeImageToFile(img, 1920, file.name, 0.85),
      resizeImageToFile(img, 480, `thumb-${file.name}`, 0.78),
    ]);

    return {
      optimizedFile: fullRes ? fullRes.file : file,
      thumbnailFile: thumbRes ? thumbRes.file : null,
      width: fullRes ? fullRes.width : img.naturalWidth,
      height: fullRes ? fullRes.height : img.naturalHeight,
    };
  } catch {
    return {
      optimizedFile: file,
      thumbnailFile: null,
      width: null,
      height: null,
    };
  }
}
