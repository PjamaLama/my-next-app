export interface ExtractedData {
  type: 'structured' | 'text' | 'metadata';
  headers?: string[];
  rows?: string[][];
  text?: string;
  metadata?: Record<string, any>;
  confidence?: number;
}

export interface FileExtractionResult {
  fileId: string;
  fileName: string;
  mimeType: string;
  extractedData: ExtractedData;
  success: boolean;
  error?: string;
}

/**
 * Extract structured data from CSV files
 */
export function extractCSVData(file: File): Promise<ExtractedData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = reader.result as string;
        const lines = text.split('\n').filter(line => line.trim());
        
        if (lines.length === 0) {
          resolve({
            type: 'text',
            text: '',
            confidence: 0
          });
          return;
        }

        // Parse headers
        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        
        // Parse rows
        const rows = lines.slice(1).map(line => {
          // Handle quoted CSV values
          const row: string[] = [];
          let current = '';
          let inQuotes = false;
          
          for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
              inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
              row.push(current.trim());
              current = '';
            } else {
              current += char;
            }
          }
          row.push(current.trim());
          
          return row.map(cell => cell.replace(/"/g, ''));
        });

        resolve({
          type: 'structured',
          headers,
          rows,
          confidence: 0.9
        });
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

/**
 * Extract basic metadata from PDF and image files
 * Note: Full text extraction happens on the backend
 */
export function extractDocumentMetadata(file: File): ExtractedData {
  return {
    type: 'metadata',
    metadata: {
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
      lastModified: new Date(file.lastModified).toISOString(),
      uploadTime: new Date().toISOString()
    },
    confidence: 1.0
  };
}

/**
 * Extract data from Excel files (basic implementation)
 * For full Excel parsing, we'd need a library like SheetJS
 */
export function extractExcelData(file: File): Promise<ExtractedData> {
  return new Promise((resolve) => {
    // For now, return metadata since full Excel parsing requires additional libraries
    resolve({
      type: 'metadata',
      metadata: {
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        type: 'excel',
        note: 'Excel parsing requires backend processing'
      },
      confidence: 0.5
    });
  });
}

/**
 * Main extraction function that routes to appropriate extractor based on file type
 */
export async function extractFileData(file: File): Promise<ExtractedData> {
  try {
    if (file.type === 'text/csv') {
      return await extractCSVData(file);
    } else if (file.type.includes('spreadsheet') || file.type.includes('excel')) {
      return await extractExcelData(file);
    } else if (file.type === 'application/pdf' || file.type.startsWith('image/')) {
      return extractDocumentMetadata(file);
    } else {
      // Fallback for unknown file types
      return {
        type: 'metadata',
        metadata: {
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
          type: 'unknown'
        },
        confidence: 0.1
      };
    }
  } catch (error) {
    return {
      type: 'metadata',
      metadata: {
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        type: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      confidence: 0
    };
  }
}

/**
 * Process multiple files and extract data from each
 */
export async function processMultipleFiles(files: File[]): Promise<FileExtractionResult[]> {
  const results: FileExtractionResult[] = [];
  
  for (const file of files) {
    try {
      const extractedData = await extractFileData(file);
      results.push({
        fileId: `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        fileName: file.name,
        mimeType: file.type,
        extractedData,
        success: true
      });
    } catch (error) {
      results.push({
        fileId: `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        fileName: file.name,
        mimeType: file.type,
        extractedData: {
          type: 'metadata',
          metadata: {
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type,
            type: 'error',
            error: error instanceof Error ? error.message : 'Unknown error'
          },
          confidence: 0
        },
        success: false,
        error: error instanceof Error ? error.message : 'Failed to extract data'
      });
    }
  }
  
  return results;
}

/**
 * Convert extracted data to a format suitable for N8N
 */
export function prepareDataForN8N(extractedResults: FileExtractionResult[]) {
  const structuredData: any[] = [];
  const textData: string[] = [];
  const metadata: any[] = [];
  
  extractedResults.forEach(result => {
    const fileName = result.fileName;
    const mimeType = result.mimeType;
    const success = result.success;
    const extractedData = result.extractedData;
    
    if (success && extractedData) {
      switch (extractedData.type) {
        case 'structured':
          if (extractedData.headers && extractedData.rows) {
            structuredData.push({
              fileName,
              mimeType,
              headers: extractedData.headers,
              rows: extractedData.rows,
              rowCount: extractedData.rows.length
            });
          }
          break;
        case 'text':
          if (extractedData.text) {
            textData.push(`${fileName}: ${extractedData.text}`);
          }
          break;
        case 'metadata':
          if (extractedData.metadata) {
            metadata.push({
              fileName,
              mimeType,
              ...extractedData.metadata
            });
          }
          break;
      }
    }
  });
  
  return {
    structuredData,
    textData,
    metadata,
    summary: {
      totalFiles: extractedResults.length,
      successfulExtractions: extractedResults.filter(r => r.success).length,
      structuredFiles: structuredData.length,
      textFiles: textData.length,
      metadataFiles: metadata.length
    }
  };
}
