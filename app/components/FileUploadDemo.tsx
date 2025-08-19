"use client";

import React, { useState } from 'react';
import FileUpload, { type UploadedFile } from './FileUpload';
import { prepareDataForN8N } from '@/lib/utils/fileExtraction';

export default function FileUploadDemo() {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [n8nData, setN8nData] = useState<any>(null);

  const handleFilesChange = (files: UploadedFile[]) => {
    setUploadedFiles(files);
    
    // Simulate N8N data preparation
    if (files.length > 0) {
      const processedData = prepareDataForN8N(files);
      setN8nData(processedData);
    } else {
      setN8nData(null);
    }
  };

  const getFileTypeIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType === 'application/pdf') return '📄';
    if (mimeType === 'text/csv') return '📊';
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return '📈';
    return '📁';
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-white mb-4">File Upload & Data Extraction Demo</h1>
        <p className="text-white/80 text-lg">
          Upload files to see how data is extracted and prepared for N8N processing
        </p>
      </div>

      {/* File Upload Section */}
      <div className="bg-white/5 rounded-lg p-6 border border-white/10">
        <h2 className="text-xl font-semibold text-white mb-4">File Upload</h2>
        <FileUpload
          onFilesChange={handleFilesChange}
          maxFiles={5}
        />
      </div>

      {/* Uploaded Files Display */}
      {uploadedFiles.length > 0 && (
        <div className="bg-white/5 rounded-lg p-6 border border-white/10">
          <h2 className="text-xl font-semibold text-white mb-4">Uploaded Files</h2>
          <div className="space-y-3">
            {uploadedFiles.map((file) => (
              <div
                key={file.id}
                className="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-white/10"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{getFileTypeIcon(file.mimeType)}</span>
                  <div>
                    <p className="text-white font-medium">{file.name}</p>
                    <p className="text-white/60 text-sm">
                      {file.mimeType} • {(file.size / 1024).toFixed(1)} KB
                    </p>
                    <p className="text-white/60 text-sm">
                      Status: <span className={`${file.status === 'completed' ? 'text-green-400' : file.status === 'error' ? 'text-red-400' : 'text-yellow-400'}`}>
                        {file.status}
                      </span>
                    </p>
                  </div>
                </div>
                
                {file.extractedData && (
                  <div className="text-right">
                    <p className="text-white/80 text-sm">
                      Type: {file.extractedData.type}
                    </p>
                    {file.extractedData.confidence && (
                      <p className="text-white/60 text-sm">
                        Confidence: {(file.extractedData.confidence * 100).toFixed(0)}%
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* N8N Data Preview */}
      {n8nData && (
        <div className="bg-white/5 rounded-lg p-6 border border-white/10">
          <h2 className="text-xl font-semibold text-white mb-4">Data Prepared for N8N</h2>
          
          {/* Summary */}
          <div className="mb-6">
            <h3 className="text-lg font-medium text-white mb-3">Summary</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white/10 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-emerald-400">{n8nData.summary.totalFiles}</p>
                <p className="text-white/60 text-sm">Total Files</p>
              </div>
              <div className="bg-white/10 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-blue-400">{n8nData.summary.successfulExtractions}</p>
                <p className="text-white/60 text-sm">Successful</p>
              </div>
              <div className="bg-white/10 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-purple-400">{n8nData.summary.structuredFiles}</p>
                <p className="text-white/60 text-sm">Structured</p>
              </div>
              <div className="bg-white/10 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-orange-400">{n8nData.summary.metadataFiles}</p>
                <p className="text-white/60 text-sm">Metadata</p>
              </div>
            </div>
          </div>

          {/* Structured Data */}
          {n8nData.structuredData.length > 0 && (
            <div className="mb-6">
              <h3 className="text-lg font-medium text-white mb-3">Structured Data</h3>
              <div className="space-y-4">
                {n8nData.structuredData.map((data: any, index: number) => (
                  <div key={index} className="bg-white/10 rounded-lg p-4">
                    <h4 className="text-white font-medium mb-2">{data.fileName}</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-white/80 text-sm mb-1">Headers:</p>
                        <div className="flex flex-wrap gap-1">
                          {data.headers.map((header: string, i: number) => (
                            <span key={i} className="px-2 py-1 bg-emerald-600/20 text-emerald-300 text-xs rounded">
                              {header}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-white/80 text-sm mb-1">Rows: {data.rowCount}</p>
                        <p className="text-white/60 text-xs">
                          Sample: {data.rows.slice(0, 2).map((row: string[]) => row.join(', ')).join('; ')}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Text Data */}
          {n8nData.textData.length > 0 && (
            <div className="mb-6">
              <h3 className="text-lg font-medium text-white mb-3">Text Data</h3>
              <div className="space-y-2">
                {n8nData.textData.map((text: string, index: number) => (
                  <div key={index} className="bg-white/10 rounded-lg p-3">
                    <p className="text-white/80 text-sm">{text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Metadata */}
          {n8nData.metadata.length > 0 && (
            <div>
              <h3 className="text-lg font-medium text-white mb-3">File Metadata</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {n8nData.metadata.map((meta: any, index: number) => (
                  <div key={index} className="bg-white/10 rounded-lg p-3">
                    <h4 className="text-white font-medium mb-2">{meta.fileName}</h4>
                    <div className="space-y-1 text-sm">
                      <p className="text-white/60">Type: {meta.type}</p>
                      <p className="text-white/60">Size: {(meta.fileSize / 1024).toFixed(1)} KB</p>
                      <p className="text-white/60">MIME: {meta.mimeType}</p>
                      {meta.uploadTime && (
                        <p className="text-white/60">Upload: {new Date(meta.uploadTime).toLocaleString()}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Usage Instructions */}
      <div className="bg-white/5 rounded-lg p-6 border border-white/10">
        <h2 className="text-xl font-semibold text-white mb-4">How It Works</h2>
        <div className="space-y-4 text-white/80">
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 bg-emerald-600 rounded-full flex items-center justify-center text-white text-sm font-bold">1</div>
            <div>
              <p className="font-medium text-white">Upload Files</p>
              <p>Drag and drop files or click to browse. Supports images, PDFs, CSV files, and spreadsheets.</p>
            </div>
          </div>
          
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 bg-emerald-600 rounded-full flex items-center justify-center text-white text-sm font-bold">2</div>
            <div>
              <p className="font-medium text-white">Frontend Processing</p>
              <p>Files are compressed (images) and basic data is extracted (CSV parsing, metadata extraction).</p>
            </div>
          </div>
          
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 bg-emerald-600 rounded-full flex items-center justify-center text-white text-sm font-bold">3</div>
            <div>
              <p className="font-medium text-white">Data Preparation</p>
              <p>Extracted data is structured and prepared for efficient transmission to N8N.</p>
            </div>
          </div>
          
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 bg-emerald-600 rounded-full flex items-center justify-center text-white text-sm font-bold">4</div>
            <div>
              <p className="font-medium text-white">N8N Integration</p>
              <p>Lightweight, structured data is sent to N8N for AI processing instead of raw files.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Benefits */}
      <div className="bg-white/5 rounded-lg p-6 border border-white/10">
        <h2 className="text-xl font-semibold text-white mb-4">Benefits</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white/10 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">🚀 Performance</h3>
            <p className="text-white/80 text-sm">Image compression and frontend processing reduce payload sizes and improve upload speeds.</p>
          </div>
          
          <div className="bg-white/10 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">💡 Smart Processing</h3>
            <p className="text-white/80 text-sm">CSV files are fully parsed on the frontend, providing immediate data structure insights.</p>
          </div>
          
          <div className="bg-white/10 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">🔒 Security</h3>
            <p className="text-white/80 text-sm">Files are processed client-side with validation and type checking before transmission.</p>
          </div>
          
          <div className="bg-white/10 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">📊 N8N Optimization</h3>
            <p className="text-white/80 text-sm">Sends lightweight, structured data to N8N instead of raw files for better AI processing.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
