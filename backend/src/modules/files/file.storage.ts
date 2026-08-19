import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { open } from "node:fs/promises";
import path from "node:path";

import multer from "multer";

import { env } from "../../config/env.js";

export const uploadRoot = path.resolve(process.cwd(), env.UPLOAD_DIR);
export const memberUploadDirectory = path.join(uploadRoot, "member-files");

mkdirSync(memberUploadDirectory, { recursive: true });

const allowedMimeTypes = new Map([
  ["application/pdf", ".pdf"],
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
]);

const storage = multer.diskStorage({
  destination: (_request, _file, callback) => callback(null, memberUploadDirectory),
  filename: (_request, file, callback) => {
    const extension = allowedMimeTypes.get(file.mimetype);
    callback(null, `${randomUUID()}${extension ?? ""}`);
  },
});

export const memberFileUpload = multer({
  storage,
  limits: { fileSize: env.MAX_UPLOAD_SIZE_MB * 1_024 * 1_024, files: 1 },
  fileFilter: (_request, file, callback) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      callback(new Error("Only PDF, JPEG, PNG, and WebP files are allowed"));
      return;
    }
    callback(null, true);
  },
});

export async function hasValidFileSignature(filePath: string, mimeType: string) {
  const handle = await open(filePath, "r");
  const header = Buffer.alloc(12);
  try {
    await handle.read(header, 0, header.length, 0);
  } finally {
    await handle.close();
  }

  if (mimeType === "application/pdf") return header.subarray(0, 5).toString() === "%PDF-";
  if (mimeType === "image/jpeg") return header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
  if (mimeType === "image/png") {
    return header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (mimeType === "image/webp") {
    return header.subarray(0, 4).toString() === "RIFF" && header.subarray(8, 12).toString() === "WEBP";
  }
  return false;
}
