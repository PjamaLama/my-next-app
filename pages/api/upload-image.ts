import type { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import fs from 'fs';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const form = formidable({
      maxFileSize: 10 * 1024 * 1024, // 10MB limit
      keepExtensions: true,
    });

    const [fields, files] = await form.parse(req);
    const geminiApiKey = Array.isArray(fields.geminiApiKey) ? fields.geminiApiKey[0] : fields.geminiApiKey;
    
    if (!geminiApiKey) {
      return res.status(400).json({ error: 'Gemini API key is required' });
    }

    const uploadedFiles = Array.isArray(files.images) ? files.images : files.images ? [files.images] : [];
    
    if (uploadedFiles.length === 0) {
      return res.status(400).json({ error: 'No images provided' });
    }

    const uploadResults = [];

    for (const file of uploadedFiles) {
      try {
        // Read file data
        const fileData = fs.readFileSync(file.filepath);
        
        // Prepare form data for Gemini Files API
        const formData = new FormData();
        const blob = new Blob([fileData], { type: file.mimetype || 'image/jpeg' });
        formData.append('file', blob, file.originalFilename || 'image.jpg');
        formData.append('metadata', JSON.stringify({
          file: {
            display_name: file.originalFilename || 'uploaded_image'
          }
        }));

        // Upload to Gemini Files API
        const uploadResponse = await fetch(
          `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${geminiApiKey}`,
          {
            method: 'POST',
            headers: {
              'X-Goog-Upload-Protocol': 'multipart',
            },
            body: formData,
          }
        );

        if (!uploadResponse.ok) {
          const errorText = await uploadResponse.text();
          console.error('Gemini Files API error:', errorText);
          throw new Error(`Failed to upload to Gemini: ${uploadResponse.status}`);
        }

        let uploadResult;
        try {
          uploadResult = await uploadResponse.json();
        } catch (parseError) {
          console.error('Failed to parse upload response as JSON:', parseError);
          throw new Error('Invalid JSON response from Gemini Files API');
        }
        
        uploadResults.push({
          originalName: file.originalFilename,
          geminiFileUri: uploadResult.file?.uri,
          geminiFileName: uploadResult.file?.name,
          mimeType: uploadResult.file?.mimeType,
        });

        // Clean up temporary file
        fs.unlinkSync(file.filepath);
      } catch (error) {
        console.error('Error uploading file:', error);
        // Clean up temporary file if it exists
        try {
          fs.unlinkSync(file.filepath);
        } catch {} // Ignore cleanup errors
        
        throw error;
      }
    }

    res.status(200).json({ 
      success: true,
      uploads: uploadResults 
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ 
      error: 'Failed to upload images',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
} 