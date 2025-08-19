"use client";

import React, { useState, useRef, useCallback } from 'react';
import { Upload, X, FileText, Image, File, Loader2 } from 'lucide-react';

export interface UploadedFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  // No more base64 data - we only need extracted data
  extractedData: any; // Structured data extracted from the file
  status: 'uploading' | 'processing' | 'completed' | 'error';
  error?: string;
}

interface FileUploadProps {
  onFilesChange: (files: UploadedFile[]) => void;
  disabled?: boolean;
  maxFiles?: number;
  acceptedTypes?: string[];
}

export default function FileUpload({ 
  onFilesChange, 
  disabled = false, 
  maxFiles = 5,
  acceptedTypes = ['image/*', 'application/pdf', 'text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
}: FileUploadProps) {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File): Promise<UploadedFile> => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    
    // Create initial file object
    const uploadedFile: UploadedFile = {
      id,
      name: file.name,
      mimeType: file.type,
      size: file.size,
      status: 'uploading',
      extractedData: {
        type: 'metadata',
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type
      }
    };

    try {
      uploadedFile.status = 'processing';

      // Extract data from the file based on type
      if (file.type === 'text/csv') {
        const text = await file.text();
        const lines = text.split('\n').filter(line => line.trim());
        if (lines.length > 0) {
          const headers = lines[0].split(',').map(h => h.trim());
          const rows = lines.slice(1).map(line => 
            line.split(',').map(cell => cell.trim())
          );
          uploadedFile.extractedData = {
            type: 'structured',
            format: 'csv',
            headers,
            rows,
            rowCount: rows.length,
            columnCount: headers.length
          };
        }
      } else if (file.type === 'application/pdf') {
        // For PDFs, extract metadata and prepare for backend processing
        uploadedFile.extractedData = {
          type: 'document',
          format: 'pdf',
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
          needsBackendProcessing: true
        };
      } else if (file.type.startsWith('image/')) {
        // For images, extract metadata and prepare for backend processing
        uploadedFile.extractedData = {
          type: 'image',
          format: file.type.split('/')[1],
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
          needsBackendProcessing: true
        };
      } else if (file.type.includes('spreadsheet')) {
        // For Excel files, extract metadata
        uploadedFile.extractedData = {
          type: 'spreadsheet',
          format: file.type.includes('openxmlformats') ? 'xlsx' : 'xls',
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
          needsBackendProcessing: true
        };
      }

      uploadedFile.status = 'completed';
      return uploadedFile;
    } catch (error) {
      uploadedFile.status = 'error';
      uploadedFile.error = error instanceof Error ? error.message : 'Failed to process file';
      return uploadedFile;
    }
  }, []);

  const handleFileSelect = useCallback(async (files: FileList) => {
    const fileArray = Array.from(files);
    const validFiles = fileArray.filter(file => {
      return acceptedTypes.some(type => {
        if (type.includes('*')) {
          return file.type.startsWith(type.replace('*', ''));
        }
        return file.type === type;
      });
    });

    if (uploadedFiles.length + validFiles.length > maxFiles) {
      alert(`You can only upload up to ${maxFiles} files at a time.`);
      return;
    }

    const newFiles: UploadedFile[] = [];
    
    for (const file of validFiles) {
      const processedFile = await processFile(file);
      newFiles.push(processedFile);
    }

    const updatedFiles = [...uploadedFiles, ...newFiles];
    setUploadedFiles(updatedFiles);
    onFilesChange(updatedFiles);
  }, [uploadedFiles, maxFiles, processFile, onFilesChange, acceptedTypes]);

  const removeFile = useCallback((id: string) => {
    const updatedFiles = uploadedFiles.filter(f => f.id !== id);
    setUploadedFiles(updatedFiles);
    onFilesChange(updatedFiles);
  }, [uploadedFiles, onFilesChange]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files) {
      handleFileSelect(e.dataTransfer.files);
    }
  }, [handleFileSelect]);

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return <Image className="w-4 h-4" />;
    if (mimeType === 'application/pdf') return <FileText className="w-4 h-4" />;
    if (mimeType.includes('spreadsheet') || mimeType === 'text/csv') return <FileText className="w-4 h-4" />;
    return <File className="w-4 h-4" />;
  };

  const getStatusIcon = (status: UploadedFile['status']) => {
    switch (status) {
      case 'uploading':
        return <Loader2 className="w-4 h-4 animate-spin" />;
      case 'processing':
        return <Loader2 className="w-4 h-4 animate-spin" />;
      case 'completed':
        return <div className="w-4 h-4 bg-green-500 rounded-full" />;
      case 'error':
        return <div className="w-4 h-4 bg-red-500 rounded-full" />;
      default:
        return null;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="w-full">
      {/* File Upload Area */}
      <div
        className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
          isDragging
            ? 'border-emerald-500 bg-emerald-50/10'
            : 'border-white/20 hover:border-white/40'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !disabled && fileInputRef.current?.click()}
      >
        <Upload className="w-8 h-8 mx-auto mb-2 text-white/60" />
        <p className="text-white/80 mb-1">
          Drop files here or <span className="text-emerald-400">click to browse</span>
        </p>
        <p className="text-xs text-white/60">
          Supports images, PDFs, CSV files, and spreadsheets
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={acceptedTypes.join(',')}
          onChange={(e) => e.target.files && handleFileSelect(e.target.files)}
          className="hidden"
          disabled={disabled}
        />
      </div>

      {/* File List */}
      {uploadedFiles.length > 0 && (
        <div className="mt-4 space-y-2">
          <h4 className="text-sm font-medium text-white/80">Uploaded Files</h4>
          {uploadedFiles.map((file) => (
            <div
              key={file.id}
              className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/10"
            >
              <div className="flex items-center gap-3">
                {getFileIcon(file.mimeType)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white/90 truncate">{file.name}</p>
                  <p className="text-xs text-white/60">
                    {formatFileSize(file.size)} • {file.mimeType}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                {getStatusIcon(file.status)}
                {file.status === 'error' && (
                  <span className="text-xs text-red-400">{file.error}</span>
                )}
                <button
                  onClick={() => removeFile(file.id)}
                  className="p-1 hover:bg-white/10 rounded transition-colors"
                  disabled={disabled}
                >
                  <X className="w-4 h-4 text-white/60" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
