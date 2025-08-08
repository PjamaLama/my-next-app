// Browser-only helper to compress images before upload

export interface CompressedImage {
  base64: string;
  mimeType: string;
}

export async function compressImageFile(
  file: File,
  maxWidth: number = 1600,
  quality: number = 0.7
): Promise<CompressedImage> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = () => {
      img.onload = () => {
        try {
          const ratio = img.width > maxWidth ? maxWidth / img.width : 1;
          const targetWidth = Math.round(img.width * ratio);
          const targetHeight = Math.round(img.height * ratio);

          const canvas = document.createElement('canvas');
          canvas.width = targetWidth;
          canvas.height = targetHeight;
          const ctx = canvas.getContext('2d');
          if (!ctx) return reject(new Error('Canvas 2D context unavailable'));

          ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

          const mimeType = 'image/jpeg';
          const dataUrl = canvas.toDataURL(mimeType, quality);
          const base64 = dataUrl.split(',')[1] || '';
          resolve({ base64, mimeType });
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}


