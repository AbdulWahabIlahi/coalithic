import { apiPost } from "@/lib/api";

export interface DocumentPrefill {
  document_type: string;
  category: string;
  mine_id: string | null;
  mine_name: string | null;
  contractor_name: string | null;
  valid_from: string | null;
  expires_on: string | null;
  title: string;
}

export interface ExtractResponse {
  document_id: string;
  raw_text: string;
  prefill: DocumentPrefill;
}

// Feature 5 — OCR auto-fill: file → base64 data URL → structured prefill.
export async function extractDocument(file: File): Promise<ExtractResponse> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("could not read file"));
    reader.readAsDataURL(file);
  });
  return apiPost<ExtractResponse>("/documents/extract", { filename: file.name, file: dataUrl });
}

export function dataUrlToFile(dataUrl: string, filename: string): File {
  const [head, body] = dataUrl.split(",");
  const mime = head.match(/data:([^;]+)/)?.[1] ?? "application/octet-stream";
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], filename, { type: mime });
}
