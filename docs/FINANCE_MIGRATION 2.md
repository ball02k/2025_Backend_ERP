Finance Module Migration Notes

This backend update adds additive models/columns to support Finance (POs + Invoices), OCR jobs, inbound email, and document links.

What changed (Prisma schema):
- New models: InvoiceLine, FinanceMatch, InboundEmail, EmailAttachment, OcrJob
- Invoice: added fields documentId, ocrStatus, ocrResultJson, poNumberRef, matchStatus, matchedPoId
- DocumentLink: added optional poId + index

Apply migrations
- Ensure your DATABASE_URL is set.
- Run: `npx prisma generate && npx prisma migrate dev -n add_finance_models`
- For production: `npx prisma migrate deploy`

Seed updates (optional)
- `npm run dev-seed` seeds a demo finance role and sample POs.

Env flags
- FEATURE_FLAGS JSON may include: finance, finance.po, finance.invoice, finance.ocr, finance.email_ingest
- PDF: PDF_MODE=none|http, PDF_HTTP_URL
- OCR: OCR_MODE=stub|http, OCR_HTTP_URL, OCR_HTTP_KEY

Notes
- PO document generation stores an HTML fallback when no external PDF renderer is configured.
- OCR worker is provided via `npm run ocr:once` / `npm run ocr:loop` and updates invoices when jobs are queued.

