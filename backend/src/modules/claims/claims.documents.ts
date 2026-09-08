import path from "node:path";
import { readFile, stat } from "node:fs/promises";
import { prisma } from "../../lib/prisma.js";
import { uploadRoot, hasValidFileSignature } from "../files/file.storage.js";
import { CLAIM_FILE_FIELDS, CLAIM_MAX_FILE_BYTES, CLAIM_MIME_EXTENSIONS } from "./mankrado.contract.js";
import { hasRequiredDocuments } from "./claims.schemas.js";
import type { ClaimSubmissionInput } from "./claims.provider.js";

export class ClaimDocumentError extends Error {}
export function validateClaimFile(file: { originalName: string; mimeType: string; sizeBytes: number }) {
  if (file.sizeBytes <= 0 || file.sizeBytes > CLAIM_MAX_FILE_BYTES) throw new ClaimDocumentError(`${file.originalName}: each file must be between 1 byte and 1 MB (1,000,000 bytes).`);
  if (!CLAIM_MIME_EXTENSIONS[file.mimeType]?.includes(path.extname(file.originalName).toLowerCase())) {
    throw new ClaimDocumentError(`${file.originalName}: use PDF, DOC, DOCX, JPEG or JPG.`);
  }
}
export async function loadClaimDocuments(claimType: string, documentIds: number[], memberId: number, uploaderMemberId?: number) {
  const files = await prisma.storedFile.findMany({ where: { id: { in: documentIds }, memberId, category: "CLAIM_DOCUMENT",
    ...(uploaderMemberId ? { uploadedByMemberId: uploaderMemberId } : {}) } });
  if (files.length !== new Set(documentIds).size) throw new ClaimDocumentError("One or more claim documents are invalid or unavailable.");
  const documents: ClaimSubmissionInput["documents"] = [];
  const fields = new Set<string>();
  for (const file of files) {
    const field = file.slotKey ? CLAIM_FILE_FIELDS[claimType]?.[file.slotKey] : undefined;
    if (!field) throw new ClaimDocumentError(`${file.originalName}: this document category is not supported by Mankrado. Remove it or choose a supported document category.`);
    if (fields.has(field)) throw new ClaimDocumentError(`${file.originalName}: only one file is allowed per document category.`);
    fields.add(field);
    validateClaimFile(file);
    const absolute = path.resolve(uploadRoot, file.storagePath);
    if (!absolute.startsWith(`${uploadRoot}${path.sep}`)) throw new ClaimDocumentError("Invalid claim document path.");
    try {
      const info = await stat(absolute);
      validateClaimFile({ ...file, sizeBytes: info.size });
      if (!(await hasValidFileSignature(absolute, file.mimeType))) throw new ClaimDocumentError(`${file.originalName}: file content does not match its type.`);
      const bytes = new Uint8Array(await readFile(absolute));
      validateClaimFile({ ...file, sizeBytes: bytes.byteLength });
      documents.push({ field, name: file.originalName, mimeType: file.mimeType, bytes });
    } catch (error) {
      if (error instanceof ClaimDocumentError) throw error;
      throw new ClaimDocumentError(`${file.originalName}: file is unavailable. Upload it again.`);
    }
  }
  if (!hasRequiredDocuments(claimType, new Set(files.flatMap((file) => file.slotKey ? [file.slotKey] : [])))) {
    throw new ClaimDocumentError("Attach the required documents for this claim type.");
  }
  return documents;
}
