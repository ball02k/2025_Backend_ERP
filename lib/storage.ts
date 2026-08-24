/**
 * Storage Service - TypeScript Wrapper
 *
 * Provides type-safe interface for file storage operations.
 * Wraps the existing CommonJS storage.factory.cjs service.
 */

// Import the CommonJS storage service
// Note: When compiled to dist/lib/storage.js, this resolves to ../../services/storage.factory.cjs
const { storageService } = require('../../services/storage.factory.cjs');

export interface UploadResult {
  url: string;
  filename: string;
  size?: number;
  mimetype?: string;
  filepath?: string;
}

export interface FileObject {
  buffer: Buffer;
  url: string;
  filename?: string;
  filepath?: string;
}

/**
 * Upload a file buffer to storage
 *
 * @param buffer - File content as Buffer
 * @param filename - Target filename
 * @param mimetype - MIME type of the file
 * @returns Upload result with URL and metadata
 */
export async function uploadToStorage(
  buffer: Buffer,
  filename: string,
  mimetype: string
): Promise<UploadResult> {
  // Convert Buffer to the format expected by storage service
  const fileObject = {
    buffer,
    mimetype,
    size: buffer.length,
  };

  return storageService.uploadFile(fileObject, filename);
}

/**
 * Get a file from storage
 *
 * @param filename - Filename to retrieve
 * @returns File buffer and metadata
 */
export async function getFromStorage(filename: string): Promise<FileObject> {
  return storageService.getFile(filename);
}

/**
 * Delete a file from storage
 *
 * @param filename - Filename to delete
 * @returns True if successful
 */
export async function deleteFromStorage(filename: string): Promise<boolean> {
  return storageService.deleteFile(filename);
}

/**
 * Get a signed URL for temporary file access
 *
 * @param filename - Filename
 * @param expiresIn - Expiration time in seconds (default: 3600 = 1 hour)
 * @returns Signed URL
 */
export async function getSignedUrl(
  filename: string,
  expiresIn: number = 3600
): Promise<string> {
  return storageService.getSignedUrl(filename, expiresIn);
}

/**
 * Download a template file from storage
 *
 * @param templatePath - Path to template file
 * @returns Buffer containing template data
 */
export async function downloadTemplate(templatePath: string): Promise<Buffer> {
  const fileObject = await getFromStorage(templatePath);
  return fileObject.buffer;
}

// Re-export the storage service for direct access if needed
export { storageService };
