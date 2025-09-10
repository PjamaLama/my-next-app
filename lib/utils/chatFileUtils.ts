/**
 * Utility functions for handling files in chat interface
 */

export interface UploadedFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  fileData?: string;
  extractedData: any;
  status: 'uploading' | 'processing' | 'completed' | 'error';
  error?: string;
}

/**
 * Convert ArrayBuffer to base64 string
 */
export const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  try {
    const uint8Array = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < uint8Array.byteLength; i++) {
      binary += String.fromCharCode(uint8Array[i]);
    }
    return btoa(binary);
  } catch (error) {
    console.error('Base64 encoding failed:', error);
    throw new Error('Failed to encode file to base64');
  }
};

/**
 * Extract text from image file (placeholder for future implementation)
 */
export const extractImageText = async (file: File): Promise<string> => {
  try {
    return `Image: ${file.name} - Ready for Gemini Vision analysis`;
  } catch (error) {
    console.warn('Image processing failed:', error);
    return '';
  }
};

/**
 * Extract text from PDF file
 */
export const extractPDFText = async (file: File): Promise<string> => {
  try {
    const text = await file.text();
    if (text.includes('(') && text.includes(')')) {
      const lines = text.split('\n')
        .filter(line => line.trim().length > 0)
        .filter(line => !line.startsWith('%') && !line.startsWith('/'))
        .slice(0, 50);
      return lines.join('\n');
    }
    return text;
  } catch (error) {
    console.warn('PDF text extraction failed, treating as scanned document:', error);
    return '';
  }
};

/**
 * Validate file for upload based on user plan
 */
export const validateFileForUpload = (file: File, userType: 'free' | 'pro' = 'free'): { valid: boolean; error?: string } => {
  // File size limits based on plan
  const maxSize = userType === 'pro' ? 25 * 1024 * 1024 : 5 * 1024 * 1024; // Pro: 25MB, Free: 5MB

  const allowedTypes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel'
  ];

  if (file.size > maxSize) {
    const maxSizeMB = userType === 'pro' ? 25 : 5;
    return {
      valid: false,
      error: `File size must be less than ${maxSizeMB}MB${userType === 'free' ? '. Upgrade to Pro for up to 25MB files' : ''}`
    };
  }

  if (!allowedTypes.includes(file.type)) {
    return { valid: false, error: 'File type not supported' };
  }

  return { valid: true };
};
