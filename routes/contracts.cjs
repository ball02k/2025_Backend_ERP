const express = require("express");
const fs = require("fs/promises");
const path = require("path");
const { Prisma } = require("@prisma/client");
const prisma = require("../lib/prisma.cjs");
const { generateContractDoc } = require("../lib/docgen.cjs");
const { writeAudit } = require("./audit.cjs");
const { checkContractIssuable } = require("../lib/compliance.cjs");

const router = express.Router();

const STATUS = {
  DRAFT: "draft",
  ISSUED: "issued",
  SIGNED: "signed"
};

function authMiddleware(req, res, next) {
  const bearer = req.headers.authorization;
  const headerUserId = req.headers["x-user-id"];
  if (bearer && bearer.startsWith("Bearer ")) {
    const token = bearer.slice(7).trim();
    if (token) {
      req.user = { id: token };
    }
  }
  if (!req.user && headerUserId) {
    req.user = { id: headerUserId };
  }
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

function tenantMiddleware(req, res, next) {
  const tenantId = req.headers["x-tenant-id"]; // simple tenant propagation for now
  if (!tenantId) {
    return res.status(400).json({ error: "Missing tenant" });
  }
  req.tenantId = tenantId;
  next();
}

function toInt(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function toDecimal(value) {
  if (value === undefined || value === null || value === "") return undefined;
  return new Prisma.Decimal(value);
}

function serialize(data) {
  return JSON.parse(
    JSON.stringify(data, (_, v) => (typeof v === "bigint" ? v.toString() : v))
  );
}

async function loadContract(tenantId, id) {
  return prisma.contract.findFirst({
    where: { id, tenantId },
    include: {
      lineItems: { orderBy: { sortOrder: "asc" } },
      documents: { include: { document: true } },
      supplier: true,
      package: true,
      project: {
        select: {
          id: true,
          project_name: true,
          project_code: true,
          status: true,
          start_date: true,
          end_date: true
        }
      }
    }
  });
}

router.use(authMiddleware);
router.use(tenantMiddleware);

router.post("/", async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const userId = req.user.id;
    const projectId = toInt(req.body.projectId);
    const packageId = toInt(req.body.packageId);
    const supplierId = toInt(req.body.supplierId);
    const { reference, title, contractType } = req.body;
    const value = toDecimal(req.body.value || 0);
    const startDate = req.body.startDate ? new Date(req.body.startDate) : null;
    const endDate = req.body.endDate ? new Date(req.body.endDate) : null;

    if (!projectId || !packageId || !supplierId || !reference || !title || !contractType) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const pkg = await prisma.package.findFirst({
      where: { id: packageId, tenantId }
    });
    if (!pkg) {
      return res.status(404).json({ error: "Package not found" });
    }

    const signedContract = await prisma.contract.findFirst({
      where: {
        tenantId,
        packageId,
        status: STATUS.SIGNED
      }
    });
    if (signedContract) {
      return res.status(409).json({ error: "Package already locked by signed contract" });
    }

    const created = await prisma.contract.create({
      data: {
        tenantId,
        projectId,
        packageId,
        supplierId,
        reference,
        title,
        contractType,
        status: STATUS.DRAFT,
        value,
        startDate,
        endDate,
        createdBy: String(userId),
        updatedBy: String(userId),
        packageLocked: true
      }
    });

    await writeAudit({
      tenantId,
      userId: String(userId),
      entity: "Contract",
      entityId: created.id,
      action: "create",
      before: null,
      after: created
    });

    const contractWithRelations = await loadContract(tenantId, created.id);
    res.status(201).json(serialize(contractWithRelations));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to create contract" });
  }
});

router.patch("/:id", async (req, res) => {
  const id = toInt(req.params.id);
  if (!id) {
    return res.status(400).json({ error: "Invalid contract id" });
  }
  try {
    const tenantId = req.tenantId;
    const userId = req.user.id;
    const contract = await loadContract(tenantId, id);
    if (!contract) {
      return res.status(404).json({ error: "Contract not found" });
    }

    if (
      contract.packageLocked &&
      req.body.packageId !== undefined &&
      toInt(req.body.packageId) !== contract.packageId
    ) {
      return res.status(409).json({ error: "Package is locked for this contract" });
    }

    if (
      contract.status !== STATUS.DRAFT &&
      req.body.lineItems !== undefined
    ) {
      return res.status(409).json({ error: "Line items can only be updated when draft" });
    }

    if (
      contract.status !== STATUS.DRAFT &&
      req.body.packageId !== undefined &&
      toInt(req.body.packageId) !== contract.packageId
    ) {
      return res.status(409).json({ error: "Package cannot be changed once issued" });
    }

    const updateData = {};
    const fields = ["reference", "title", "contractType", "startDate", "endDate"];
    fields.forEach((field) => {
      if (req.body[field] !== undefined) {
        if (field === "startDate" || field === "endDate") {
          updateData[field] = req.body[field] ? new Date(req.body[field]) : null;
        } else {
          updateData[field] = req.body[field];
        }
      }
    });

    if (req.body.value !== undefined) {
      updateData.value = toDecimal(req.body.value);
    }

    if (req.body.supplierId !== undefined) {
      updateData.supplierId = toInt(req.body.supplierId);
    }

    if (Object.keys(updateData).length === 0) {
      return res.json(serialize(contract));
    }

    const updated = await prisma.contract.update({
      where: { id },
      data: {
        ...updateData,
        updatedBy: String(userId)
      }
    });

    await writeAudit({
      tenantId,
      userId: String(userId),
      entity: "Contract",
      entityId: updated.id,
      action: "update",
      before: contract,
      after: updated
    });

    const withRelations = await loadContract(tenantId, id);
    res.json(serialize(withRelations));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to update contract" });
  }
});

router.post("/:id/issue", async (req, res) => {
  const id = toInt(req.params.id);
  if (!id) {
    return res.status(400).json({ error: "Invalid contract id" });
  }
  try {
    const tenantId = req.tenantId;
    const userId = req.user.id;
    const contract = await loadContract(tenantId, id);
    if (!contract) {
      return res.status(404).json({ error: "Contract not found" });
    }
    if (contract.status !== STATUS.DRAFT) {
      return res.status(409).json({ error: "Only draft contracts can be issued" });
    }

    const compliance = await checkContractIssuable({ tenantId, contractId: id });
    if (!compliance.compliant) {
      const reason = req.body?.overrideReason;
      if (!reason) {
        return res.status(409).json({
          error: "Contract failed compliance checks",
          issues: compliance.issues || []
        });
      }
      await writeAudit({
        tenantId,
        userId: String(userId),
        entity: "Contract",
        entityId: id,
        action: "override",
        before: contract,
        after: contract,
        reason
      });
    }

    const updated = await prisma.contract.update({
      where: { id },
      data: {
        status: STATUS.ISSUED,
        issuedAt: new Date(),
        issuedBy: String(userId),
        updatedBy: String(userId)
      }
    });

    await writeAudit({
      tenantId,
      userId: String(userId),
      entity: "Contract",
      entityId: id,
      action: "issue",
      before: contract,
      after: updated,
      reason: req.body?.overrideReason || null
    });

    const withRelations = await loadContract(tenantId, id);
    res.json(serialize(withRelations));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to issue contract" });
  }
});

router.post("/:id/sign", async (req, res) => {
  const id = toInt(req.params.id);
  if (!id) {
    return res.status(400).json({ error: "Invalid contract id" });
  }
  try {
    const tenantId = req.tenantId;
    const userId = req.user.id;
    const contract = await loadContract(tenantId, id);
    if (!contract) {
      return res.status(404).json({ error: "Contract not found" });
    }
    if (contract.status !== STATUS.ISSUED) {
      return res.status(409).json({ error: "Only issued contracts can be signed" });
    }

    const updated = await prisma.contract.update({
      where: { id },
      data: {
        status: STATUS.SIGNED,
        signedAt: new Date(),
        signedBy: String(userId),
        updatedBy: String(userId)
      }
    });

    await writeAudit({
      tenantId,
      userId: String(userId),
      entity: "Contract",
      entityId: id,
      action: "sign",
      before: contract,
      after: updated
    });

    const withRelations = await loadContract(tenantId, id);
    res.json(serialize(withRelations));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to sign contract" });
  }
});

router.get("/", async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const where = { tenantId };
    const projectId = toInt(req.query.projectId);
    const supplierId = toInt(req.query.supplierId);
    const status = req.query.status;
    const q = req.query.q;

    if (projectId) where.projectId = projectId;
    if (supplierId) where.supplierId = supplierId;
    if (status) where.status = status;
    if (q) {
      where.OR = [
        { title: { contains: q, mode: "insensitive" } },
        { reference: { contains: q, mode: "insensitive" } }
      ];
    }

    const contracts = await prisma.contract.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        supplier: { select: { id: true, name: true } },
        package: { select: { id: true, name: true } },
        project: { select: { id: true, project_name: true } }
      }
    });

    res.json(serialize(contracts));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch contracts" });
  }
});

router.get("/:id", async (req, res) => {
  const id = toInt(req.params.id);
  if (!id) {
    return res.status(400).json({ error: "Invalid contract id" });
  }
  try {
    const tenantId = req.tenantId;
    const contract = await loadContract(tenantId, id);
    if (!contract) {
      return res.status(404).json({ error: "Contract not found" });
    }
    res.json(serialize(contract));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch contract" });
  }
});

router.post("/:id/line-items", async (req, res) => {
  const id = toInt(req.params.id);
  if (!id) {
    return res.status(400).json({ error: "Invalid contract id" });
  }
  if (!Array.isArray(req.body?.lineItems)) {
    return res.status(400).json({ error: "lineItems must be an array" });
  }

  const tenantId = req.tenantId;
  const userId = req.user.id;

  try {
    const contract = await loadContract(tenantId, id);
    if (!contract) {
      return res.status(404).json({ error: "Contract not found" });
    }
    if (contract.status !== STATUS.DRAFT) {
      return res.status(409).json({ error: "Line items can only be changed when draft" });
    }

    const before = await prisma.contractLineItem.findMany({
      where: { tenantId, contractId: id }
    });

    const results = [];

    await prisma.$transaction(async (tx) => {
      for (const item of req.body.lineItems) {
        const quantityValue = item.quantity !== undefined ? new Prisma.Decimal(item.quantity) : null;
        const rateValue = item.rate !== undefined ? new Prisma.Decimal(item.rate) : null;
        let totalValue = null;
        if (item.total !== undefined) {
          totalValue = new Prisma.Decimal(item.total);
        } else if (quantityValue !== null && rateValue !== null) {
          totalValue = quantityValue.mul(rateValue);
        }

        const data = {
          tenantId,
          contractId: id,
          description: item.description,
          quantity: quantityValue,
          rate: rateValue,
          total: totalValue,
          sortOrder: item.sortOrder ?? null
        };

        if (!data.description) {
          throw new Error("Line item description required");
        }

        if (item.id) {
          const existing = await tx.contractLineItem.findFirst({
            where: { id: item.id, contractId: id, tenantId }
          });
          if (!existing) {
            throw new Error(`Line item ${item.id} not found`);
          }
          const updated = await tx.contractLineItem.update({
            where: { id: existing.id },
            data
          });
          results.push(updated);
        } else {
          const created = await tx.contractLineItem.create({ data });
          results.push(created);
        }
      }
    });

    const after = await prisma.contractLineItem.findMany({
      where: { tenantId, contractId: id }
    });

    await prisma.contract.update({
      where: { id },
      data: { updatedBy: String(userId) }
    });

    await writeAudit({
      tenantId,
      userId: String(userId),
      entity: "ContractLineItem",
      entityId: id,
      action: "upsert-line-items",
      before,
      after
    });

    res.json(serialize(after));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || "Failed to upsert line items" });
  }
});

router.delete("/:id/line-items/:lineItemId", async (req, res) => {
  const contractId = toInt(req.params.id);
  const lineItemId = toInt(req.params.lineItemId);
  if (!contractId || !lineItemId) {
    return res.status(400).json({ error: "Invalid ids" });
  }
  try {
    const tenantId = req.tenantId;
    const userId = req.user.id;
    const contract = await loadContract(tenantId, contractId);
    if (!contract) {
      return res.status(404).json({ error: "Contract not found" });
    }
    if (contract.status !== STATUS.DRAFT) {
      return res.status(409).json({ error: "Line items can only be removed when draft" });
    }

    const item = await prisma.contractLineItem.findFirst({
      where: { id: lineItemId, contractId, tenantId }
    });
    if (!item) {
      return res.status(404).json({ error: "Line item not found" });
    }

    await prisma.contractLineItem.delete({ where: { id: lineItemId } });
    await prisma.contract.update({
      where: { id: contractId },
      data: { updatedBy: String(userId) }
    });

    await writeAudit({
      tenantId,
      userId: String(userId),
      entity: "ContractLineItem",
      entityId: lineItemId,
      action: "delete-line-item",
      before: item,
      after: null
    });

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to delete line item" });
  }
});

router.post("/:id/generate", async (req, res) => {
  const id = toInt(req.params.id);
  if (!id) {
    return res.status(400).json({ error: "Invalid contract id" });
  }
  try {
    const tenantId = req.tenantId;
    const userId = req.user.id;
    const contract = await loadContract(tenantId, id);
    if (!contract) {
      return res.status(404).json({ error: "Contract not found" });
    }

    const templateKey = req.body?.templateKey || "default";
    const { documentId } = await generateContractDoc({ tenantId, contractId: id, templateKey });

    const link = await prisma.contractDocumentLink.create({
      data: {
        tenantId,
        contractId: id,
        documentId,
        documentType: "generated",
        metadata: { templateKey }
      },
      include: { document: true }
    });

    await writeAudit({
      tenantId,
      userId: String(userId),
      entity: "ContractDocumentLink",
      entityId: link.id,
      action: "generate-document",
      before: null,
      after: link
    });

    res.status(201).json(serialize({ documentId, link }));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to generate contract document" });
  }
});

router.post("/:id/esign", async (req, res) => {
  const id = toInt(req.params.id);
  if (!id) {
    return res.status(400).json({ error: "Invalid contract id" });
  }
  try {
    const tenantId = req.tenantId;
    const userId = req.user.id;
    const contract = await loadContract(tenantId, id);
    if (!contract) {
      return res.status(404).json({ error: "Contract not found" });
    }

    const payload = req.body?.payload || {};
    const now = Date.now();
    const token = `pending-${id}-${now}`;

    const esignDir = path.join(__dirname, "..", "uploads", "esign");
    await fs.mkdir(esignDir, { recursive: true });
    const fileName = `esign-${id}-${now}.json`;
    const storagePath = path.join("uploads", "esign", fileName);
    const absolutePath = path.join(__dirname, "..", storagePath);
    const filePayload = {
      contractId: id,
      generatedAt: new Date().toISOString(),
      token,
      payload
    };
    await fs.writeFile(absolutePath, JSON.stringify(filePayload, null, 2), "utf8");

    const document = await prisma.document.create({
      data: {
        tenantId,
        fileName,
        storagePath,
        mimeType: "application/json",
        metadata: {
          type: "esign",
          token
        },
        createdBy: String(userId)
      }
    });

    const link = await prisma.contractDocumentLink.create({
      data: {
        tenantId,
        contractId: id,
        documentId: document.id,
        documentType: "esign",
        metadata: { token }
      },
      include: { document: true }
    });

    await writeAudit({
      tenantId,
      userId: String(userId),
      entity: "ContractDocumentLink",
      entityId: link.id,
      action: "esign-handoff",
      before: null,
      after: link
    });

    res.status(201).json(serialize({ token, link }));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to initiate e-sign" });
  }
});

module.exports = router;
