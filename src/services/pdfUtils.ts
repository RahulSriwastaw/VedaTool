import * as pdfjsLib from "pdfjs-dist";

// Configure pdfjs-dist using a reliable CDN for version 5+
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

export const convertPdfToImages = async (
  pdfFile: File,
  onProgress?: (percent: number, status: string) => void,
): Promise<string[]> => {
  const arrayBuffer = await pdfFile.arrayBuffer();
  onProgress?.(10, "Loading PDF structure...");
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const imageUrls: string[] = [];
  const totalPages = pdf.numPages;

  for (let i = 1; i <= totalPages; i++) {
    onProgress?.(
      10 + Math.round(((i - 1) / totalPages) * 85),
      `Processing & converting page ${i} of ${totalPages}...`,
    );
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2.0 }); // High quality
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) continue;

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    await page.render({
      canvasContext: context,
      viewport: viewport,
      canvas: canvas,
    }).promise;

    imageUrls.push(canvas.toDataURL("image/jpeg", 0.8));
  }

  onProgress?.(100, "Processing complete!");
  return imageUrls;
};

export const readFileAsBase64 = (
  file: File,
  onProgress?: (percent: number, status: string) => void,
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        onProgress?.(percent, `Reading file: ${percent}%`);
      }
    };
    reader.onload = () => {
      onProgress?.(100, "Reading file complete!");
      resolve(reader.result as string);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export const cropImage = (
  base64Str: string,
  bbox: [number, number, number, number],
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const [ymin, xmin, ymax, xmax] = bbox;
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Failed to get canvas context"));
        return;
      }

      const width = ((xmax - xmin) * img.width) / 1000;
      const height = ((ymax - ymin) * img.height) / 1000;
      const x = (xmin * img.width) / 1000;
      const y = (ymin * img.height) / 1000;

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, x, y, width, height, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = reject;
  });
};
