const express = require('express');
const router = express.Router();
const { prisma } = require('../utils/prisma.cjs');
const requireAuth = require('../middleware/requireAuth.cjs');

router.use(requireAuth);

const tenantIdOf = (req) => req.user && req.user.tenantId;

// ==========================================
// PACKAGE RESPONSE (SUPPLIER PRICING) ROUTES
// ==========================================

// GET /api/package-responses/:id - Get specific package response
router.get('/:id', async (req, res, next) => {
  try {
    const tenantId = tenantIdOf(req);
    const responseId = Number(req.params.id);

    const response = await prisma.packageResponse.findFirst({
      where: {
        id: responseId,
        tenantId
      },
      include: {
        package: {
          include: {
            lineItems: {
              orderBy: { displayOrder: 'asc' }
            }
          }
        },
        lineItemPrices: {
          include: {
            lineItem: true
          },
          orderBy: {
            lineItem: {
              displayOrder: 'asc'
            }
          }
        },
        supplier: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    if (!response) {
      return res.status(404).json({ error: 'Package response not found' });
    }

    res.json(response);
  } catch (e) {
    console.error('[Package Response] GET by ID error:', e);
    next(e);
  }
});

// GET /api/package-responses - Get or create package response
router.get('/', async (req, res, next) => {
  try {
    const tenantId = tenantIdOf(req);
    const { packageId, tenderResponseId } = req.query;

    if (!packageId || !tenderResponseId) {
      return res.status(400).json({
        error: 'Missing required parameters: packageId and tenderResponseId'
      });
    }

    // Get or create package response for this supplier
    let response = await prisma.packageResponse.findFirst({
      where: {
        packageId: Number(packageId),
        tenderResponseId: Number(tenderResponseId),
        tenantId
      },
      include: {
        package: {
          include: {
            lineItems: {
              orderBy: { displayOrder: 'asc' }
            }
          }
        },
        lineItemPrices: {
          include: {
            lineItem: true
          }
        }
      }
    });

    // If doesn't exist, create draft
    if (!response) {
      const tenderResponse = await prisma.tenderResponse.findFirst({
        where: {
          id: Number(tenderResponseId),
          tenantId
        }
      });

      if (!tenderResponse) {
        return res.status(404).json({ error: 'Tender response not found' });
      }

      response = await prisma.packageResponse.create({
        data: {
          tenantId,
          packageId: Number(packageId),
          tenderResponseId: Number(tenderResponseId),
          supplierId: tenderResponse.supplierId,
          pricingType: 'LUMP_SUM_ONLY',
          packageTotal: 0,
          status: 'draft'
        },
        include: {
          package: {
            include: {
              lineItems: {
                orderBy: { displayOrder: 'asc' }
              }
            }
          },
          lineItemPrices: true
        }
      });

      console.log('[Package Response] Created draft response:', response.id);
    }

    res.json(response);
  } catch (e) {
    console.error('[Package Response] GET error:', e);
    next(e);
  }
});

// POST /api/package-responses - Create/update supplier pricing
router.post('/', async (req, res, next) => {
  try {
    const tenantId = tenantIdOf(req);
    const userId = req.user?.id;
    const {
      id,
      packageId,
      tenderResponseId,
      pricingType,
      packageTotal,
      preliminaries,
      prelimsPercentage,
      contingency,
      contingencyPercentage,
      overheadsProfit,
      overheadsProfitPerc,
      programmeDuration,
      startDate,
      completionDate,
      keyMilestones,
      paymentTerms,
      retentionPercentage,
      retentionAmount,
      defectsLiability,
      warranties,
      bondRequired,
      bondPercentage,
      insuranceDetails,
      assumptions,
      exclusions,
      clarifications,
      alternatives,
      technicalCompliance,
      complianceNotes,
      deviations,
      keyPersonnel,
      subcontractors,
      plantEquipment,
      qualityPlan,
      safetyPlan,
      methodStatement,
      attachments,
      lineItemPrices,
      status
    } = req.body;

    // Validation
    if (!packageTotal || packageTotal <= 0) {
      return res.status(400).json({
        error: 'Package total must be greater than 0'
      });
    }

    const updateData = {
      pricingType,
      packageTotal: parseFloat(packageTotal),
      preliminaries: preliminaries ? parseFloat(preliminaries) : null,
      prelimsPercentage: prelimsPercentage ? parseFloat(prelimsPercentage) : null,
      contingency: contingency ? parseFloat(contingency) : null,
      contingencyPercentage: contingencyPercentage ? parseFloat(contingencyPercentage) : null,
      overheadsProfit: overheadsProfit ? parseFloat(overheadsProfit) : null,
      overheadsProfitPerc: overheadsProfitPerc ? parseFloat(overheadsProfitPerc) : null,
      programmeDuration: programmeDuration ? parseInt(programmeDuration) : null,
      startDate: startDate ? new Date(startDate) : null,
      completionDate: completionDate ? new Date(completionDate) : null,
      keyMilestones: keyMilestones || null,
      paymentTerms: paymentTerms || null,
      retentionPercentage: retentionPercentage ? parseFloat(retentionPercentage) : null,
      retentionAmount: retentionAmount ? parseFloat(retentionAmount) : null,
      defectsLiability: defectsLiability ? parseInt(defectsLiability) : null,
      warranties: warranties || null,
      bondRequired: bondRequired || false,
      bondPercentage: bondPercentage ? parseFloat(bondPercentage) : null,
      insuranceDetails: insuranceDetails || null,
      assumptions: assumptions || null,
      exclusions: exclusions || null,
      clarifications: clarifications || null,
      alternatives: alternatives || null,
      technicalCompliance: technicalCompliance !== undefined ? technicalCompliance : null,
      complianceNotes: complianceNotes || null,
      deviations: deviations || null,
      keyPersonnel: keyPersonnel || null,
      subcontractors: subcontractors || null,
      plantEquipment: plantEquipment || null,
      qualityPlan: qualityPlan || null,
      safetyPlan: safetyPlan || null,
      methodStatement: methodStatement || null,
      attachments: attachments || null,
      lastSavedAt: new Date()
    };

    // If submitting, add submission timestamp
    if (status === 'submitted') {
      updateData.status = 'submitted';
      updateData.submittedAt = new Date();
    }

    let response;

    if (id) {
      // Update existing response
      response = await prisma.packageResponse.update({
        where: {
          id: Number(id)
        },
        data: {
          ...updateData,

          // Update line item prices if provided
          ...(lineItemPrices && lineItemPrices.length > 0 && {
            lineItemPrices: {
              deleteMany: {}, // Clear existing
              create: lineItemPrices.map(item => ({
                tenantId,
                lineItemId: item.lineItemId,
                rate: item.rate ? parseFloat(item.rate) : null,
                total: parseFloat(item.total),
                notes: item.notes || null,
                alternative: item.alternative || null,
                specification: item.specification || null,
                labourCost: item.labourCost ? parseFloat(item.labourCost) : null,
                materialCost: item.materialCost ? parseFloat(item.materialCost) : null,
                plantCost: item.plantCost ? parseFloat(item.plantCost) : null,
                subcontractCost: item.subcontractCost ? parseFloat(item.subcontractCost) : null
              }))
            }
          })
        },
        include: {
          lineItemPrices: {
            include: {
              lineItem: true
            }
          },
          package: true
        }
      });

      // Create audit log
      await prisma.packagePricingAuditLog.create({
        data: {
          tenantId,
          packageResponseId: response.id,
          action: status === 'submitted' ? 'submitted' : 'updated',
          changes: updateData,
          performedBy: userId || null,
          performedByType: 'user',
          ipAddress: req.ip || null
        }
      }).catch(err => {
        console.error('[Package Response] Audit log failed:', err);
        // Don't fail the operation if audit fails
      });

      console.log('[Package Response] Updated:', response.id);
    } else {
      // Create new response
      const tenderResponse = await prisma.tenderResponse.findFirst({
        where: {
          id: Number(tenderResponseId),
          tenantId
        }
      });

      if (!tenderResponse) {
        return res.status(404).json({ error: 'Tender response not found' });
      }

      response = await prisma.packageResponse.create({
        data: {
          tenantId,
          packageId: Number(packageId),
          tenderResponseId: Number(tenderResponseId),
          supplierId: tenderResponse.supplierId,
          ...updateData,

          // Create line item prices if provided
          ...(lineItemPrices && lineItemPrices.length > 0 && {
            lineItemPrices: {
              create: lineItemPrices.map(item => ({
                tenantId,
                lineItemId: item.lineItemId,
                rate: item.rate ? parseFloat(item.rate) : null,
                total: parseFloat(item.total),
                notes: item.notes || null,
                alternative: item.alternative || null,
                specification: item.specification || null,
                labourCost: item.labourCost ? parseFloat(item.labourCost) : null,
                materialCost: item.materialCost ? parseFloat(item.materialCost) : null,
                plantCost: item.plantCost ? parseFloat(item.plantCost) : null,
                subcontractCost: item.subcontractCost ? parseFloat(item.subcontractCost) : null
              }))
            }
          })
        },
        include: {
          lineItemPrices: {
            include: {
              lineItem: true
            }
          },
          package: true
        }
      });

      // Create audit log
      await prisma.packagePricingAuditLog.create({
        data: {
          tenantId,
          packageResponseId: response.id,
          action: 'created',
          changes: updateData,
          performedBy: userId || null,
          performedByType: 'user',
          ipAddress: req.ip || null
        }
      }).catch(err => {
        console.error('[Package Response] Audit log failed:', err);
      });

      console.log('[Package Response] Created:', response.id);
    }

    res.status(id ? 200 : 201).json(response);
  } catch (e) {
    console.error('[Package Response] POST error:', e);
    next(e);
  }
});

module.exports = router;
