# Email + OCR Payment Application System - Setup Guide

## Overview

This system allows suppliers to email payment application PDFs to `payments@yourdomain.com`. The system automatically:

1. **Receives** emails via Cloudflare Email Routing
2. **Extracts** PDF attachments
3. **OCRs** documents using AWS Textract
4. **Parses** payment application data (amounts, dates, references)
5. **Matches** to existing contracts automatically
6. **Creates** draft payment applications for QS review

---

## Architecture

```
Supplier Email → Cloudflare Email Routing → Webhook → Your Backend
                                                        ↓
                                                    AWS S3 (PDF Storage)
                                                        ↓
                                                    AWS Textract (OCR)
                                                        ↓
                                                    Parser → Contract Matcher
                                                        ↓
                                                    Draft Payment Application
```

---

## Prerequisites

### 1. AWS Account

You need an AWS account with:
- S3 bucket for PDF storage
- Textract service enabled
- IAM credentials with permissions

### 2. Cloudflare Account

- Domain configured in Cloudflare
- Email Routing enabled

### 3. Environment Variables

Add these to your `.env` file:

```bash
# AWS Configuration
AWS_REGION=eu-west-2
AWS_ACCESS_KEY_ID=your_access_key_here
AWS_SECRET_ACCESS_KEY=your_secret_key_here
AWS_S3_BUCKET=erp-payment-applications

# Cloudflare Email (optional - for webhook validation)
CLOUDFLARE_EMAIL_SECRET=your_webhook_secret_here
```

---

## Step 1: AWS Setup

### 1.1 Create S3 Bucket

```bash
# Using AWS CLI
aws s3 mb s3://erp-payment-applications --region eu-west-2

# Set bucket policy (allow Textract access)
aws s3api put-bucket-policy --bucket erp-payment-applications --policy '{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "TextractAccess",
      "Effect": "Allow",
      "Principal": {
        "Service": "textract.amazonaws.com"
      },
      "Action": [
        "s3:GetObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::erp-payment-applications/*",
        "arn:aws:s3:::erp-payment-applications"
      ]
    }
  ]
}'
```

### 1.2 Create IAM User and Credentials

1. Go to **AWS Console** → **IAM** → **Users** → **Create User**
2. User name: `erp-textract-service`
3. Attach policies:
   - `AmazonS3FullAccess` (or create custom policy with limited permissions)
   - `AmazonTextractFullAccess`
4. Create **Access Key** → Save credentials to `.env`

### 1.3 Custom IAM Policy (Recommended - Least Privilege)

Create a custom policy with minimal permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::erp-payment-applications/*",
        "arn:aws:s3:::erp-payment-applications"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "textract:DetectDocumentText",
        "textract:AnalyzeDocument",
        "textract:StartDocumentTextDetection",
        "textract:GetDocumentTextDetection"
      ],
      "Resource": "*"
    }
  ]
}
```

---

## Step 2: Cloudflare Email Routing Setup

### 2.1 Add Domain to Cloudflare

1. Go to **Cloudflare Dashboard**
2. Add your domain (e.g., `yourdomain.com`)
3. Update nameservers at your domain registrar

### 2.2 Enable Email Routing

1. Go to **Email** → **Email Routing**
2. Click **Get Started**
3. Add MX and TXT records (Cloudflare auto-configures)
4. Verify email routing is active

### 2.3 Create Email Address

1. **Destination Address**: `payments@yourdomain.com`
2. **Action**: Send to a Worker
3. Create a new Worker

### 2.4 Configure Worker to Forward to Webhook

```javascript
// Cloudflare Worker code
export default {
  async email(message, env, ctx) {
    // Forward email to your backend webhook
    const webhookUrl = 'https://your-backend.com/api/email-ingestion/webhook';

    // Extract email data
    const formData = new FormData();
    formData.append('from', message.from);
    formData.append('to', message.to);
    formData.append('subject', message.headers.get('subject'));
    formData.append('messageId', message.headers.get('message-id'));
    formData.append('receivedAt', new Date().toISOString());

    // Get email body
    const textBody = await new Response(message.raw).text();
    formData.append('text', textBody);

    // Extract attachments
    for await (const attachment of message.attachments) {
      if (attachment.type === 'application/pdf') {
        const blob = await attachment.arrayBuffer();
        formData.append('attachments', new Blob([blob], { type: 'application/pdf' }), attachment.name);
      }
    }

    // Send to webhook
    const response = await fetch(webhookUrl, {
      method: 'POST',
      body: formData,
      headers: {
        'X-Cloudflare-Email-Secret': env.WEBHOOK_SECRET
      }
    });

    console.log('Webhook response:', response.status);
  }
}
```

---

## Step 3: Test the System

### 3.1 Manual PDF Upload (Testing)

Use the manual upload endpoint for testing:

```bash
curl -X POST http://localhost:3001/api/email-ingestion/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "pdf=@payment-application.pdf" \
  -F "tenantId=demo" \
  -F "emailSender=supplier@example.com" \
  -F "subject=Payment Application #2"
```

### 3.2 Test Email Flow

Send an email to `payments@yourdomain.com` with:
- **Subject**: Payment Application #2 - Project X
- **Attachment**: PDF payment application
- **From**: Supplier email address

### 3.3 Check Logs

Monitor your backend logs:

```bash
# You should see:
📧 [Email Ingestion] Received email webhook
📄 [Email Ingestion] Processing PDF: payment-application.pdf
✅ [Textract] Uploaded PDF to S3: payment-applications/demo/1234567890-payment-application.pdf
✅ [Textract] Analyzed document, confidence: 95.50%
[Parser] Extracted 12/15 fields (80.0% confidence)
[ContractMatcher] Matched contract: CONTRACT-001 (85% confidence)
✅ [Email Ingestion] Created draft application #PA-000001
```

---

## API Endpoints

### POST /api/email-ingestion/webhook
**Cloudflare Email Routing webhook**

Receives emails with payment application PDFs.

**Request (multipart/form-data):**
- `from`: Sender email
- `to`: Recipient email
- `subject`: Email subject
- `text`: Email body
- `messageId`: Unique email ID
- `receivedAt`: ISO timestamp
- `attachments[]`: PDF files

**Response:**
```json
{
  "success": true,
  "emailFrom": "supplier@example.com",
  "emailSubject": "Payment Application #2",
  "processed": 1,
  "results": [
    {
      "filename": "payment-app-002.pdf",
      "success": true,
      "applicationId": 123,
      "matched": true,
      "confidence": 85
    }
  ]
}
```

### POST /api/email-ingestion/upload
**Manual PDF upload (for testing)**

**Request (multipart/form-data):**
- `pdf`: PDF file
- `tenantId`: Tenant ID
- `emailSender`: Supplier email
- `subject`: Application subject
- `supplierId` (optional): Force supplier match
- `contractId` (optional): Force contract match

**Response:**
```json
{
  "success": true,
  "applicationId": 123,
  "matched": true,
  "confidence": 85,
  "application": { /* full application object */ }
}
```

### GET /api/email-ingestion/applications/:id/ocr
**Get OCR details for an application**

**Response:**
```json
{
  "id": 123,
  "applicationNo": "PA-000001",
  "sourceType": "EMAIL",
  "emailSender": "supplier@example.com",
  "ocrStatus": "COMPLETED",
  "ocrConfidence": 95.5,
  "ocrRawText": "Full extracted text...",
  "ocrExtractedData": {
    "claimedGrossValue": 50000,
    "retentionPercentage": 5,
    /* ... more extracted fields */
  },
  "contractMatchMethod": "AUTO_MATCHED",
  "contractMatchConfidence": 85,
  "requiresReview": true
}
```

### POST /api/email-ingestion/applications/:id/review
**Mark OCR data as reviewed by QS**

**Request:**
```json
{
  "notes": "Reviewed OCR extraction, all values correct"
}
```

**Response:**
```json
{
  "success": true,
  "application": { /* updated application */ }
}
```

---

## Database Schema

New fields added to `ApplicationForPayment` model:

### Email Ingestion
- `sourceType`: EMAIL | MANUAL | API
- `emailSender`: Sender email address
- `emailSubject`: Email subject
- `emailBody`: Email text
- `emailReceivedAt`: When email was received
- `emailMessageId`: Unique email ID
- `emailAttachmentCount`: Number of attachments

### OCR Processing
- `ocrStatus`: PENDING | PROCESSING | COMPLETED | FAILED | SKIPPED
- `ocrStartedAt`: OCR start timestamp
- `ocrCompletedAt`: OCR completion timestamp
- `ocrError`: Error message if failed
- `ocrRawText`: Full extracted text
- `ocrConfidence`: Confidence score (0-100)
- `ocrS3Key`: S3 key for PDF
- `ocrS3Bucket`: S3 bucket name
- `ocrJobId`: AWS Textract job ID
- `ocrExtractedData`: JSON with structured data

### Contract Matching
- `contractMatchMethod`: AUTO_MATCHED | SUGGESTED | MANUAL
- `contractMatchConfidence`: Match confidence (0-100)
- `suggestedContracts`: Array of suggested contracts
- `contractMatchedAt`: When contract was matched
- `contractMatchedBy`: User who confirmed match

### Auto-Population Flags
- `autoPopulated`: Was created from OCR?
- `requiresReview`: Needs QS review?
- `ocrReviewedBy`: User who reviewed
- `ocrReviewedAt`: Review timestamp
- `ocrReviewNotes`: Review notes

---

## Troubleshooting

### PDFs Not Processing

**Check:**
1. AWS credentials are correct in `.env`
2. S3 bucket exists and is accessible
3. Textract is enabled in your AWS region
4. PDF file size < 20MB
5. Check backend logs for errors

### Contract Not Matching

**Reasons:**
- Contract reference not found in OCR text
- Supplier email doesn't match any suppliers
- Contract is not in ACTIVE/LIVE status

**Solutions:**
1. Add supplier email to Supplier record
2. Ensure contract reference format matches
3. Check `suggestedContracts` field for alternatives
4. Manually assign contract in frontend

### Low OCR Confidence

**Causes:**
- Poor scan quality
- Handwritten text
- Non-standard format
- Faded/blurry text

**Solutions:**
1. Request higher quality PDF from supplier
2. Manually review and correct extracted fields
3. Add custom parsing rules for specific formats

### Email Not Arriving

**Check:**
1. Cloudflare Email Routing is active
2. Worker is deployed and configured
3. Webhook URL is correct and accessible
4. Check Cloudflare Worker logs
5. Verify domain MX records

---

## Security Considerations

1. **Webhook Authentication**
   - Add secret token to webhook requests
   - Validate `X-Cloudflare-Email-Secret` header
   - Rate limit the webhook endpoint

2. **S3 Security**
   - Enable bucket encryption
   - Set lifecycle policies to delete old PDFs
   - Use IAM policies with least privilege

3. **Data Privacy**
   - PDF files contain sensitive financial data
   - Consider enabling S3 encryption at rest
   - Set retention policies for GDPR compliance

4. **Access Control**
   - Only authorized users can review OCR data
   - Audit log for OCR reviews
   - Restrict manual upload endpoint

---

## Frontend Integration (Next Steps)

### OCR Review Page

Create a page for QS to review OCR-extracted applications:

```jsx
// src/pages/PaymentApplicationOCRReview.jsx
import React from 'react';

export default function PaymentApplicationOCRReview({ applicationId }) {
  const [application, setApplication] = useState(null);
  const [ocrData, setOcrData] = useState(null);

  useEffect(() => {
    // Load application and OCR data
    fetch(`/api/email-ingestion/applications/${applicationId}/ocr`)
      .then(res => res.json())
      .then(data => setOcrData(data));

    fetch(`/api/applications/${applicationId}`)
      .then(res => res.json())
      .then(data => setApplication(data));
  }, [applicationId]);

  return (
    <div>
      <h1>Review OCR Extraction</h1>

      {/* Show extracted values with confidence scores */}
      <div className="ocr-fields">
        <Field
          label="Gross Value Claimed"
          value={application.claimedGrossValue}
          confidence={ocrData.ocrConfidence}
          source="OCR"
        />
        {/* More fields... */}
      </div>

      {/* Show suggested contracts if not auto-matched */}
      {!application.contractId && (
        <SuggestedContracts
          suggestions={ocrData.suggestedContracts}
          onSelect={contractId => assignContract(contractId)}
        />
      )}

      {/* Show raw OCR text for verification */}
      <details>
        <summary>View Raw OCR Text</summary>
        <pre>{ocrData.ocrRawText}</pre>
      </details>
    </div>
  );
}
```

---

## Cost Estimates

### AWS Textract Pricing (EU West 2)

- **DetectDocumentText**: $1.50 per 1,000 pages
- **AnalyzeDocument (Forms)**: $50 per 1,000 pages
- **S3 Storage**: $0.023 per GB/month

**Example:**
- 100 payment applications/month
- Average 3 pages per application
- Total: 300 pages/month

**Monthly Cost:**
- OCR: 300 × $0.05 = **$15/month**
- S3 Storage (1GB): **$0.023/month**
- **Total: ~$15/month**

### Cloudflare Email Routing

- **Free tier**: 1,000 messages/month
- **Paid tier**: $5/month for unlimited

---

## Monitoring & Alerts

Set up monitoring for:

1. **OCR Success Rate**: Track `ocrStatus = COMPLETED` vs `FAILED`
2. **Contract Match Rate**: Track `contractMatchMethod = AUTO_MATCHED`
3. **Processing Time**: Monitor time from email → draft application
4. **Error Rate**: Alert on repeated OCR failures
5. **Review Queue**: Alert QS when applications require review

---

## Next Steps

1. Deploy to production
2. Configure Cloudflare Email Routing
3. Test with real supplier emails
4. Build frontend OCR review UI
5. Train QS team on review process
6. Set up monitoring and alerts
7. Document supplier email format requirements

---

## Support

For issues:
- Check backend logs: `npm run logs`
- Check Cloudflare Worker logs
- Check AWS CloudWatch logs for Textract errors
- Review OCR extraction quality in database

Contact dev team if you encounter persistent issues.
