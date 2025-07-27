// Genkit configuration for prompt management
// This file documents the prompt setup for this project

export const genkitConfig = {
  // Primary prompt directory for editing (source of truth)
  sourcePromptDirectory: '.prompt',
  
  // Genkit prompt directory (where Genkit looks for prompts)
  genkitPromptDirectory: 'prompts',
  
  // Instructions:
  // 1. Edit prompts in the .prompt directory
  // 2. Copy updated prompts to the prompts directory for Genkit to use
  // 3. Genkit will automatically reload prompts from the prompts directory
}; 