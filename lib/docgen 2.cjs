const fs = require("fs/promises");
const path = require("path");
const prisma = require("./prisma.cjs");

async function generateContractDoc({ tenantId, contractId, templateKey }) {
  if (!tenantId) {
    throw new Error("tenantId is required");
  }
  if (!contractId) {
    throw new Error("contractId is required");
  }

  const documentsDir = path.join(__dirname, "..", "uploads", "documents");
  await fs.mkdir(documentsDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `contract-${contractId}-${timestamp}.txt`;
  const storagePath = path.join("uploads", "documents", fileName);
  const absolutePath = path.join(__dirname, "..", storagePath);
  const placeholder = [
    `Contract: ${contractId}`,
    `Template: ${templateKey || "default"}`,
    `Generated at: ${new Date().toISOString()}`,
    "",
    "This is a placeholder document."
  ].join("\n");

  await fs.writeFile(absolutePath, placeholder, "utf8");

  const document = await prisma.document.create({
    data: {
      tenantId,
      fileName,
      storagePath,
      mimeType: "text/plain",
      metadata: {
        contractId,
        templateKey: templateKey || null
      }
    }
  });

  return { documentId: document.id };
}

module.exports = { generateContractDoc };
