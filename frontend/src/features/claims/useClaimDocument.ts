import { useState } from "react";
import api from "@/lib/api";

type OpenableDocument = { id?: number; originalName: string; storedName?: string };

// Staff documents open in a new tab; members download through an owned-claim endpoint.
// The /files/:storedName route requires the staff bearer
// token, which a plain <a href> navigation wouldn't send (the token lives only in memory and is
// attached by the api client's request interceptor), so the file is fetched as a blob through
// `api` and opened via an object URL that is revoked shortly after.
export function useClaimDocument(memberClaimId?: number) {
  const [error, setError] = useState("");
  const open = async (doc: OpenableDocument) => {
    setError("");
    try {
      if (memberClaimId ? !doc.id : !doc.storedName)
        throw new Error("Missing claim document reference");
      const endpoint = memberClaimId
        ? `/member-portal/claims/${memberClaimId}/documents/${doc.id}`
        : `/files/${doc.storedName}`;
      const response = await api.get(endpoint, { responseType: "blob" });
      const url = URL.createObjectURL(response.data);
      if (memberClaimId) {
        const link = document.createElement("a");
        link.href = url;
        link.download = doc.originalName;
        document.body.append(link);
        link.click();
        link.remove();
      } else window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      setError(`Unable to open ${doc.originalName}.`);
    }
  };
  return { open, error };
}
