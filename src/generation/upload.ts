export async function uploadMedia(file: File): Promise<{ url: string }> {
  // GitHub Pages is a static host and cannot execute the old /api/blob route.
  // Keep the media local and let @gradio/client upload it directly to the
  // selected Hugging Face Space at generation time.
  return { url: URL.createObjectURL(file) };
}
