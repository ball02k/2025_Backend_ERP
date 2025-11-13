const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

/**
 * Storage Factory - Returns appropriate storage service based on environment
 */
function createStorageService() {
  const storageType = process.env.FILE_STORAGE_TYPE ||
    (process.env.NODE_ENV === 'production' ? 'oracle' : 'local');

  console.log(`📁 Initializing ${storageType.toUpperCase()} storage...`);

  if (storageType === 'oracle') {
    return new OracleCloudStorage();
  } else {
    return new LocalFileStorage();
  }
}

/**
 * LOCAL FILE STORAGE (Development)
 */
class LocalFileStorage {
  constructor() {
    this.uploadDir = path.resolve(process.env.FILE_STORAGE_PATH || './uploads');

    // Ensure upload directory exists
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
      console.log(`✅ Created uploads directory: ${this.uploadDir}`);
    }
  }

  async uploadFile(file, filename) {
    try {
      const filepath = path.join(this.uploadDir, filename);

      // Save file
      await fs.promises.writeFile(filepath, file.buffer);

      // Return local URL
      const url = `/uploads/${filename}`;

      console.log(`✅ Local upload: ${filename}`);

      return {
        url,
        filepath,
        filename,
        size: file.size,
        mimetype: file.mimetype
      };
    } catch (error) {
      console.error('❌ Local upload error:', error);
      throw new Error(`Failed to upload file locally: ${error.message}`);
    }
  }

  async getFile(filename) {
    try {
      const filepath = path.join(this.uploadDir, filename);

      if (!fs.existsSync(filepath)) {
        throw new Error('File not found');
      }

      const buffer = await fs.promises.readFile(filepath);

      return {
        buffer,
        filepath,
        url: `/uploads/${filename}`
      };
    } catch (error) {
      console.error('❌ Local get file error:', error);
      throw error;
    }
  }

  async deleteFile(filename) {
    try {
      const filepath = path.join(this.uploadDir, filename);

      if (fs.existsSync(filepath)) {
        await fs.promises.unlink(filepath);
        console.log(`✅ Deleted local file: ${filename}`);
      }

      return true;
    } catch (error) {
      console.error('❌ Local delete error:', error);
      throw error;
    }
  }

  async getSignedUrl(filename, expiresIn = 3600) {
    // For local, just return the static URL
    return `/uploads/${filename}`;
  }
}

/**
 * ORACLE CLOUD STORAGE (Production)
 */
class OracleCloudStorage {
  constructor() {
    this.client = new S3Client({
      region: process.env.ORACLE_REGION,
      endpoint: `https://${process.env.ORACLE_NAMESPACE}.compat.objectstorage.${process.env.ORACLE_REGION}.oraclecloud.com`,
      credentials: {
        accessKeyId: process.env.ORACLE_ACCESS_KEY_ID,
        secretAccessKey: process.env.ORACLE_SECRET_ACCESS_KEY,
      },
      forcePathStyle: false,
    });

    this.bucketName = process.env.ORACLE_BUCKET_NAME;
  }

  async uploadFile(file, filename) {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: filename,
        Body: file.buffer,
        ContentType: file.mimetype,
      });

      await this.client.send(command);

      // Generate signed URL for access
      const url = await this.getSignedUrl(filename);

      console.log(`✅ Oracle upload: ${filename}`);

      return {
        url,
        filename,
        size: file.size,
        mimetype: file.mimetype
      };
    } catch (error) {
      console.error('❌ Oracle upload error:', error);
      throw new Error(`Failed to upload to Oracle Cloud: ${error.message}`);
    }
  }

  async getFile(filename) {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: filename,
      });

      const response = await this.client.send(command);

      // Convert stream to buffer
      const chunks = [];
      for await (const chunk of response.Body) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);

      const url = await this.getSignedUrl(filename);

      return {
        buffer,
        url,
        filename
      };
    } catch (error) {
      console.error('❌ Oracle get file error:', error);
      throw error;
    }
  }

  async deleteFile(filename) {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: filename,
      });

      await this.client.send(command);
      console.log(`✅ Deleted Oracle file: ${filename}`);

      return true;
    } catch (error) {
      console.error('❌ Oracle delete error:', error);
      throw error;
    }
  }

  async getSignedUrl(filename, expiresIn = 3600) {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: filename,
      });

      const url = await getSignedUrl(this.client, command, { expiresIn });
      return url;
    } catch (error) {
      console.error('❌ Oracle signed URL error:', error);
      throw error;
    }
  }
}

// Export singleton instance
const storageService = createStorageService();

module.exports = {
  storageService,
  createStorageService
};
