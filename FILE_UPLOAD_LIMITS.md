# File Upload Limits

## Overview
This application supports uploading images and PDF files for AI analysis and data extraction. To ensure optimal performance and prevent system overload, we've implemented the following limits:

## File Size Limits

### Individual File Limits
- **Maximum file size**: 8MB per file
- **Supported formats**: Images (JPEG, PNG, GIF, etc.) and PDF documents
- **Base64 encoding overhead**: Files become ~33% larger when converted to base64 for API transmission

### Total Upload Limits
- **Maximum total size**: 20MB for all files combined
- **Maximum number of files**: No strict limit, but constrained by total size

## Why These Limits?

1. **API Performance**: Larger files take longer to process and can timeout
2. **Memory Usage**: Base64 encoding increases file size by ~33%
3. **Network Stability**: Large uploads can fail on slow connections
4. **Gemini API Limits**: The underlying AI service has its own processing limits

## What Happens When Limits Are Exceeded?

### Client-Side Validation
- Files are checked before upload
- Clear error messages explain the issue
- Users can remove files and try again

### Server-Side Validation
- Additional checks ensure limits aren't bypassed
- Detailed error responses with specific file information
- Graceful handling of oversized requests

## Tips for Large Files

1. **Compress images** before uploading
2. **Split large PDFs** into smaller sections
3. **Use lower resolution** for images when possible
4. **Combine multiple small files** instead of one large file

## Error Messages

### File Too Large
```
"filename.pdf" is too large (12.5MB). Maximum file size is 8MB.
```

### Total Size Exceeded
```
Total file size (25.3MB) exceeds the 20MB limit. Please upload fewer files.
```

### Server Error
```
File size limit exceeded: File 1 exceeds the 8MB limit. Please compress or resize your file.
```

## Technical Details

- **Client validation**: JavaScript checks file sizes before upload
- **Server validation**: Node.js API validates base64 data size
- **Error handling**: Specific HTTP status codes (413) for size issues
- **User feedback**: Clear, actionable error messages

## Future Improvements

- Automatic image compression
- Progressive file upload
- Chunked file processing
- Cloud storage integration for large files 