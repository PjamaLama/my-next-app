import { describe, it, expect } from '@jest/globals';

// Mock the formatPrivateKey function from googleSheets
const formatPrivateKey = (rawKey: string): string => {
  if (!rawKey) return '';
  
  // Remove any surrounding quotes
  let key = rawKey.trim().replace(/^["']|["']$/g, '');
  
  // Handle various newline formats that can occur when copying from JSON
  // Replace literal \n with actual newlines
  key = key.replace(/\\n/g, '\n');
  
  // If the key doesn't start with -----BEGIN PRIVATE KEY-----,
  // it might be missing the header/footer or have wrong formatting
  if (!key.includes('-----BEGIN PRIVATE KEY-----')) {
    // Try to reconstruct the key if it's just the base64 content
    if (key.length > 100 && !key.includes('-----')) {
      key = `-----BEGIN PRIVATE KEY-----\n${key}\n-----END PRIVATE KEY-----`;
    }
  }
  
  return key;
};

describe('Private Key Parsing', () => {
  it('should handle properly formatted private key', () => {
    const input = '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\n-----END PRIVATE KEY-----';
    const result = formatPrivateKey(input);
    
    expect(result).toBe(input);
    expect(result).toContain('-----BEGIN PRIVATE KEY-----');
    expect(result).toContain('-----END PRIVATE KEY-----');
  });

  it('should handle escaped newlines from JSON', () => {
    const input = '-----BEGIN PRIVATE KEY-----\\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\\n-----END PRIVATE KEY-----';
    const result = formatPrivateKey(input);
    
    expect(result).toContain('-----BEGIN PRIVATE KEY-----');
    expect(result).toContain('-----END PRIVATE KEY-----');
    expect(result).not.toContain('\\n');
    expect(result).toContain('\n');
  });

  it('should handle quoted strings', () => {
    const input = '"-----BEGIN PRIVATE KEY-----\\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\\n-----END PRIVATE KEY-----"';
    const result = formatPrivateKey(input);
    
    expect(result).toContain('-----BEGIN PRIVATE KEY-----');
    expect(result).toContain('-----END PRIVATE KEY-----');
    expect(result).not.toContain('"');
  });

  it('should reconstruct key if missing headers', () => {
    const input = 'MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...';
    console.log('Input:', input);
    console.log('Input length:', input.length);
    console.log('Input includes -----:', input.includes('-----'));
    const result = formatPrivateKey(input);
    console.log('Result:', result);
    console.log('Result includes BEGIN:', result.includes('-----BEGIN PRIVATE KEY-----'));
    
    expect(result).toContain('-----BEGIN PRIVATE KEY-----');
    expect(result).toContain('-----END PRIVATE KEY-----');
    expect(result).toContain(input);
  });

  it('should handle empty input', () => {
    const result = formatPrivateKey('');
    expect(result).toBe('');
  });

  it('should handle null/undefined input', () => {
    const result = formatPrivateKey(null as any);
    expect(result).toBe('');
  });

  it('should preserve key content exactly', () => {
    const keyContent = 'MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...';
    const input = `-----BEGIN PRIVATE KEY-----\n${keyContent}\n-----END PRIVATE KEY-----`;
    const result = formatPrivateKey(input);
    
    expect(result).toContain(keyContent);
  });
});
