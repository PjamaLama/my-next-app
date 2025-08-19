import { extractDocumentMetadata, extractExcelData } from '@/lib/utils/fileExtraction';

// Mock File object for testing
function createMockFile(content: string, type: string, name: string): File {
  const blob = new Blob([content], { type });
  return new File([blob], name, { type });
}

describe('File Extraction Utilities', () => {
  describe('extractDocumentMetadata', () => {
    it('should extract metadata from files', () => {
      const file = createMockFile('content', 'application/pdf', 'test.pdf');
      
      const result = extractDocumentMetadata(file);
      
      expect(result.type).toBe('metadata');
      expect(result.metadata?.fileName).toBe('test.pdf');
      expect(result.metadata?.mimeType).toBe('application/pdf');
      expect(result.metadata?.fileSize).toBe(7);
      expect(result.confidence).toBe(1.0);
    });
  });

  describe('extractExcelData', () => {
    it('should return metadata for Excel files', async () => {
      const file = createMockFile('content', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'test.xlsx');
      
      const result = await extractExcelData(file);
      
      expect(result.type).toBe('metadata');
      expect(result.metadata?.type).toBe('excel');
      expect(result.metadata?.fileName).toBe('test.xlsx');
      expect(result.confidence).toBe(0.5);
    });
  });
});
