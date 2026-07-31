// Small helpers shared by the student "turn in a PDF" flow and the teacher
// "view a submitted PDF" flow. Files are sent to/from the backend as plain
// base64 (no object storage bucket is configured in this environment — see
// NOTES.md — so the PDF itself lives in the database row).

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // reader.result looks like "data:application/pdf;base64,JVBERi0x..."
      const commaIndex = result.indexOf(",");
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

export function openPdfFromBase64(base64: string, fileName: string) {
  const byteChars = atob(base64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
  const blob = new Blob([new Uint8Array(byteNumbers)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (!win) {
    // Pop-up blocked — fall back to a same-tab download so the teacher
    // still gets the file instead of a silent no-op.
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName || "homework.pdf";
    a.click();
  }
  // Revoke a little later so the new tab/download has time to actually load the blob.
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
