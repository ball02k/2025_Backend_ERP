// ==============================================================================
// AWS TEXTRACT SERVICE - Document OCR
// ==============================================================================

const {
  TextractClient,
  StartDocumentTextDetectionCommand,
  GetDocumentTextDetectionCommand,
  AnalyzeDocumentCommand
} = require('@aws-sdk/client-textract');

const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');

/**
 * AWS Textract Service for Payment Application OCR
 *
 * Supports both synchronous (AnalyzeDocument) and asynchronous (StartDocumentTextDetection)
 * processing depending on document size.
 */
class TextractService {
  constructor() {
    // Initialize AWS clients
    const awsConfig = {
      region: process.env.AWS_REGION || 'eu-west-2',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    };

    this.textractClient = new TextractClient(awsConfig);
    this.s3Client = new S3Client(awsConfig);

    this.s3Bucket = process.env.AWS_S3_BUCKET || 'erp-payment-applications';
    this.s3Region = process.env.AWS_REGION || 'eu-west-2';
  }

  /**
   * Upload PDF to S3 for processing
   * @param {Buffer} pdfBuffer - PDF file buffer
   * @param {String} filename - Original filename
   * @param {String} tenantId - Tenant ID
   * @returns {Object} - S3 key and bucket info
   */
  async uploadToS3(pdfBuffer, filename, tenantId) {
    const timestamp = Date.now();
    const s3Key = `payment-applications/${tenantId}/${timestamp}-${filename}`;

    const command = new PutObjectCommand({
      Bucket: this.s3Bucket,
      Key: s3Key,
      Body: pdfBuffer,
      ContentType: 'application/pdf',
      Metadata: {
        tenant: tenantId,
        uploadedAt: new Date().toISOString(),
      },
    });

    await this.s3Client.send(command);

    console.log(`✅ [Textract] Uploaded PDF to S3: ${s3Key}`);

    return {
      s3Bucket: this.s3Bucket,
      s3Key,
      s3Region: this.s3Region,
    };
  }

  /**
   * Start async Textract job for large documents (> 5 pages or > 5MB)
   * @param {String} s3Bucket - S3 bucket name
   * @param {String} s3Key - S3 object key
   * @returns {String} - Textract job ID
   */
  async startTextDetection(s3Bucket, s3Key) {
    const command = new StartDocumentTextDetectionCommand({
      DocumentLocation: {
        S3Object: {
          Bucket: s3Bucket,
          Name: s3Key,
        },
      },
    });

    const response = await this.textractClient.send(command);
    console.log(`✅ [Textract] Started async job: ${response.JobId}`);

    return response.JobId;
  }

  /**
   * Get results from async Textract job
   * @param {String} jobId - Textract job ID
   * @returns {Object} - Extraction results
   */
  async getTextDetectionResults(jobId) {
    const command = new GetDocumentTextDetectionCommand({
      JobId: jobId,
    });

    const response = await this.textractClient.send(command);

    if (response.JobStatus === 'IN_PROGRESS') {
      console.log(`⏳ [Textract] Job still in progress: ${jobId}`);
      return { status: 'IN_PROGRESS', jobId };
    }

    if (response.JobStatus === 'FAILED') {
      console.error(`❌ [Textract] Job failed: ${jobId}`, response.StatusMessage);
      return { status: 'FAILED', error: response.StatusMessage, jobId };
    }

    // Job succeeded - extract text
    const blocks = response.Blocks || [];
    const { fullText, lines, confidence } = this.extractTextFromBlocks(blocks);

    console.log(`✅ [Textract] Job completed: ${jobId}, confidence: ${confidence.toFixed(2)}%`);

    return {
      status: 'COMPLETED',
      jobId,
      fullText,
      lines,
      confidence,
      blocks,
    };
  }

  /**
   * Synchronous analyze for small documents (< 5 pages, < 5MB)
   * @param {String} s3Bucket - S3 bucket name
   * @param {String} s3Key - S3 object key
   * @returns {Object} - Extraction results
   */
  async analyzeDocument(s3Bucket, s3Key) {
    const command = new AnalyzeDocumentCommand({
      Document: {
        S3Object: {
          Bucket: s3Bucket,
          Name: s3Key,
        },
      },
      FeatureTypes: ['FORMS', 'TABLES'], // Extract forms and tables
    });

    const response = await this.textractClient.send(command);
    const blocks = response.Blocks || [];

    const { fullText, lines, confidence } = this.extractTextFromBlocks(blocks);
    const keyValuePairs = this.extractKeyValuePairs(blocks);
    const tables = this.extractTables(blocks);

    console.log(`✅ [Textract] Analyzed document, confidence: ${confidence.toFixed(2)}%`);

    return {
      status: 'COMPLETED',
      fullText,
      lines,
      confidence,
      keyValuePairs,
      tables,
      blocks,
    };
  }

  /**
   * Extract plain text from Textract blocks
   * @param {Array} blocks - Textract blocks
   * @returns {Object} - fullText, lines, confidence
   */
  extractTextFromBlocks(blocks) {
    const lines = [];
    let totalConfidence = 0;
    let confidenceCount = 0;

    for (const block of blocks) {
      if (block.BlockType === 'LINE') {
        lines.push({
          text: block.Text,
          confidence: block.Confidence || 0,
        });

        if (block.Confidence) {
          totalConfidence += block.Confidence;
          confidenceCount++;
        }
      }
    }

    const fullText = lines.map(l => l.text).join('\n');
    const avgConfidence = confidenceCount > 0 ? totalConfidence / confidenceCount : 0;

    return {
      fullText,
      lines,
      confidence: avgConfidence,
    };
  }

  /**
   * Extract key-value pairs from form fields
   * @param {Array} blocks - Textract blocks
   * @returns {Object} - Key-value pairs extracted from form
   */
  extractKeyValuePairs(blocks) {
    const keyValuePairs = {};
    const blockMap = {};

    // Build block map
    for (const block of blocks) {
      blockMap[block.Id] = block;
    }

    // Find KEY_VALUE_SET blocks
    for (const block of blocks) {
      if (block.BlockType === 'KEY_VALUE_SET') {
        if (block.EntityTypes && block.EntityTypes.includes('KEY')) {
          const keyText = this.getTextFromBlock(block, blockMap);
          const valueBlock = this.getValueBlock(block, blockMap);
          const valueText = valueBlock ? this.getTextFromBlock(valueBlock, blockMap) : '';

          if (keyText && valueText) {
            keyValuePairs[keyText.trim()] = valueText.trim();
          }
        }
      }
    }

    return keyValuePairs;
  }

  /**
   * Extract tables from document
   * @param {Array} blocks - Textract blocks
   * @returns {Array} - Extracted tables
   */
  extractTables(blocks) {
    const tables = [];
    const blockMap = {};

    // Build block map
    for (const block of blocks) {
      blockMap[block.Id] = block;
    }

    // Find TABLE blocks
    for (const block of blocks) {
      if (block.BlockType === 'TABLE') {
        const table = this.buildTable(block, blockMap);
        tables.push(table);
      }
    }

    return tables;
  }

  /**
   * Build table structure from TABLE block
   * @param {Object} tableBlock - TABLE block
   * @param {Object} blockMap - Map of all blocks
   * @returns {Object} - Table structure
   */
  buildTable(tableBlock, blockMap) {
    const cells = [];

    if (tableBlock.Relationships) {
      for (const relationship of tableBlock.Relationships) {
        if (relationship.Type === 'CHILD') {
          for (const childId of relationship.Ids) {
            const cell = blockMap[childId];
            if (cell && cell.BlockType === 'CELL') {
              cells.push({
                rowIndex: cell.RowIndex,
                columnIndex: cell.ColumnIndex,
                text: this.getTextFromBlock(cell, blockMap),
                confidence: cell.Confidence,
              });
            }
          }
        }
      }
    }

    // Organize cells into rows
    const rows = {};
    for (const cell of cells) {
      if (!rows[cell.rowIndex]) {
        rows[cell.rowIndex] = [];
      }
      rows[cell.rowIndex][cell.columnIndex] = cell.text;
    }

    return {
      rows: Object.values(rows),
      cellCount: cells.length,
    };
  }

  /**
   * Get text content from a block and its children
   * @param {Object} block - Textract block
   * @param {Object} blockMap - Map of all blocks
   * @returns {String} - Extracted text
   */
  getTextFromBlock(block, blockMap) {
    let text = '';

    if (block.Text) {
      text = block.Text;
    } else if (block.Relationships) {
      for (const relationship of block.Relationships) {
        if (relationship.Type === 'CHILD') {
          for (const childId of relationship.Ids) {
            const childBlock = blockMap[childId];
            if (childBlock && childBlock.Text) {
              text += childBlock.Text + ' ';
            }
          }
        }
      }
    }

    return text.trim();
  }

  /**
   * Get VALUE block associated with a KEY block
   * @param {Object} keyBlock - KEY block
   * @param {Object} blockMap - Map of all blocks
   * @returns {Object} - VALUE block
   */
  getValueBlock(keyBlock, blockMap) {
    if (keyBlock.Relationships) {
      for (const relationship of keyBlock.Relationships) {
        if (relationship.Type === 'VALUE') {
          for (const valueId of relationship.Ids) {
            return blockMap[valueId];
          }
        }
      }
    }
    return null;
  }

  /**
   * Process payment application PDF end-to-end
   * @param {Buffer} pdfBuffer - PDF file buffer
   * @param {String} filename - Original filename
   * @param {String} tenantId - Tenant ID
   * @param {Boolean} async - Use async processing (default false for < 5 pages)
   * @returns {Object} - OCR results with S3 info
   */
  async processPaymentApplication(pdfBuffer, filename, tenantId, async = false) {
    try {
      // Upload to S3
      const { s3Bucket, s3Key, s3Region } = await this.uploadToS3(pdfBuffer, filename, tenantId);

      // Choose processing method
      let results;
      if (async) {
        // Start async job
        const jobId = await this.startTextDetection(s3Bucket, s3Key);
        results = {
          status: 'PROCESSING',
          jobId,
          s3Bucket,
          s3Key,
          s3Region,
        };
      } else {
        // Synchronous analysis
        const ocrResults = await this.analyzeDocument(s3Bucket, s3Key);
        results = {
          ...ocrResults,
          s3Bucket,
          s3Key,
          s3Region,
        };
      }

      return results;
    } catch (error) {
      console.error('❌ [Textract] Processing error:', error);
      throw error;
    }
  }
}

module.exports = new TextractService();
