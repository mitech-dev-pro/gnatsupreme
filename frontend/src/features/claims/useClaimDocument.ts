import { useState } from "react";
import api from "@/lib/api";

type OpenableDocument = { originalName: string; storedName: string };

// Opens a claim document in a new tab. The /files/:storedName route requires the staff bearer
// token, which a plain <a href> navigation wouldn't send (the token lives only in memory and is
// attached by the api client's request interceptor), so the file is fetched as a blob through
// `api` and opened via an object URL that is revoked shortly after.
export function useClaimDocument() {
  const [error, setError] = useState("");
  const open = async (doc: OpenableDocument) => {
    setError("");
    try {
      const response = await api.get(`/files/${doc.storedName}`, { responseType: "blob" });
      const url = URL.createObjectURL(response.data);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      setError(`Unable to open ${doc.originalName}.`);
    }
  };
  return { open, error };
}
