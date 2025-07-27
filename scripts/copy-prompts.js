#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Configuration
const sourceDir = '.prompt';
const targetDir = 'prompts';

// Ensure target directory exists
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

// Copy all .prompt files from source to target
function copyPrompts() {
  try {
    const files = fs.readdirSync(sourceDir);
    const promptFiles = files.filter(file => file.endsWith('.prompt'));
    
    if (promptFiles.length === 0) {
      console.log('No .prompt files found in source directory');
      return;
    }
    
    let copiedCount = 0;
    promptFiles.forEach(file => {
      const sourcePath = path.join(sourceDir, file);
      const targetPath = path.join(targetDir, file);
      
      fs.copyFileSync(sourcePath, targetPath);
      console.log(`✓ Copied ${file} to ${targetDir}/`);
      copiedCount++;
    });
    
    console.log(`\nSuccessfully copied ${copiedCount} prompt file(s) to ${targetDir}/`);
    console.log('Genkit will automatically reload the updated prompts.');
    
  } catch (error) {
    console.error('Error copying prompts:', error.message);
    process.exit(1);
  }
}

// Run the copy operation
copyPrompts(); 