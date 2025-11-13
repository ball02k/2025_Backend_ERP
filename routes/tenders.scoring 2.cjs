const express = require('express');
const { PrismaClient, Prisma } = require('@prisma/client');

const prisma = new PrismaClient();
const router = express.Router();

function parseTenderId(param) {
  const id = parseInt(param, 10);
  if (Number.isNaN(id)) {
    return null;
  }
  return id;
}

function decimalOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Prisma.Decimal) return value;
  const num = typeof value === 'number' ? value : parseFloat(value);
  if (Number.isNaN(num)) return null;
  return new Prisma.Decimal(num);
}

router.post('/tenders/:id/criteria', async (req, res) => {
  const tenderId = parseTenderId(req.params.id);
  if (!tenderId) {
    return res.status(400).json({ error: 'Invalid tender id' });
  }

  const { criteria } = req.body || {};
  if (!Array.isArray(criteria)) {
    return res.status(400).json({ error: 'criteria array is required' });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.tenderCriteria.findMany({ where: { tender_id: tenderId } });
      const incomingIds = [];

      for (const item of criteria) {
        const payload = {
          name: item.name,
          weight: decimalOrNull(item.weight) ?? new Prisma.Decimal(0),
          type: item.type
        };

        if (item.id) {
          await tx.tenderCriteria.update({
            where: { id: item.id },
            data: payload
          });
          incomingIds.push(item.id);
        } else {
          const created = await tx.tenderCriteria.create({
            data: {
              tender_id: tenderId,
              ...payload
            }
          });
          incomingIds.push(created.id);
        }
      }

      const toDelete = existing
        .filter((criterion) => !incomingIds.includes(criterion.id))
        .map((criterion) => criterion.id);

      if (toDelete.length) {
        await tx.tenderCriteria.deleteMany({ where: { id: { in: toDelete } } });
      }

      return tx.tenderCriteria.findMany({ where: { tender_id: tenderId } });
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update criteria' });
  }
});

router.post('/tenders/:id/score/auto', async (req, res) => {
  const tenderId = parseTenderId(req.params.id);
  if (!tenderId) {
    return res.status(400).json({ error: 'Invalid tender id' });
  }

  try {
    const [criteria, submissions] = await Promise.all([
      prisma.tenderCriteria.findMany({ where: { tender_id: tenderId } }),
      prisma.tenderSubmission.findMany({
        where: { tender_id: tenderId, status: 'submitted' },
        include: { items: true }
      })
    ]);

    const priceCriteria = criteria.filter((criterion) => criterion.type === 'price');
    if (!priceCriteria.length) {
      return res.status(400).json({ error: 'No price criteria configured' });
    }

    const totals = submissions.map((submission) => {
      let sum = 0;
      submission.items.forEach((item) => {
        const explicit = item.total !== null && item.total !== undefined ? parseFloat(item.total) : null;
        const quantity = item.quantity !== null && item.quantity !== undefined ? parseFloat(item.quantity) : null;
        const unit = item.unit_price !== null && item.unit_price !== undefined ? parseFloat(item.unit_price) : null;
        if (explicit !== null && !Number.isNaN(explicit)) {
          sum += explicit;
        } else if (quantity !== null && unit !== null && !Number.isNaN(quantity) && !Number.isNaN(unit)) {
          sum += quantity * unit;
        }
      });
      if (submission.total_price) {
        const aggregate = parseFloat(submission.total_price);
        if (!Number.isNaN(aggregate)) {
          sum = aggregate;
        }
      }
      return { submissionId: submission.id, total: sum };
    });

    const validTotals = totals.filter((entry) => entry.total > 0);
    if (!validTotals.length) {
      return res.status(400).json({ error: 'No priced submissions available for scoring' });
    }

    const lowest = Math.min(...validTotals.map((entry) => entry.total));

    await prisma.$transaction(async (tx) => {
      for (const criterion of priceCriteria) {
        const weight = parseFloat(criterion.weight);
        if (!Number.isFinite(weight) || weight <= 0) {
          await tx.tenderScore.updateMany({
            where: { criteria_id: criterion.id },
            data: { autoScore: null }
          });
          continue;
        }

        for (const { submissionId, total } of totals) {
          if (!total || !Number.isFinite(total)) {
            await tx.tenderScore.upsert({
              where: {
                criteria_id_submission_id: {
                  criteria_id: criterion.id,
                  submission_id: submissionId
                }
              },
              update: { autoScore: null },
              create: {
                criteria_id: criterion.id,
                submission_id: submissionId,
                autoScore: null
              }
            });
            continue;
          }

          const scoreValue = lowest === 0 ? 0 : (lowest / total) * weight;
          await tx.tenderScore.upsert({
            where: {
              criteria_id_submission_id: {
                criteria_id: criterion.id,
                submission_id: submissionId
              }
            },
            update: {
              autoScore: new Prisma.Decimal(Number(scoreValue.toFixed(2)))
            },
            create: {
              criteria_id: criterion.id,
              submission_id: submissionId,
              autoScore: new Prisma.Decimal(Number(scoreValue.toFixed(2)))
            }
          });
        }
      }
    });

    res.json({ message: 'Auto scores calculated' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to calculate scores' });
  }
});

router.post('/tenders/:id/score/manual', async (req, res) => {
  const tenderId = parseTenderId(req.params.id);
  if (!tenderId) {
    return res.status(400).json({ error: 'Invalid tender id' });
  }

  const { scores } = req.body || {};
  if (!Array.isArray(scores)) {
    return res.status(400).json({ error: 'scores array is required' });
  }

  try {
    const operations = scores.map((entry) =>
      prisma.tenderScore.upsert({
        where: {
          criteria_id_submission_id: {
            criteria_id: entry.criteriaId,
            submission_id: entry.submissionId
          }
        },
        update: {
          manualScore: decimalOrNull(entry.manualScore),
          overrideReason: entry.overrideReason ?? null
        },
        create: {
          criteria_id: entry.criteriaId,
          submission_id: entry.submissionId,
          manualScore: decimalOrNull(entry.manualScore),
          overrideReason: entry.overrideReason ?? null
        }
      })
    );

    const results = await prisma.$transaction(operations);
    res.json({ updated: results.length });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update manual scores' });
  }
});

router.get('/tenders/:id/register', async (req, res) => {
  const tenderId = parseTenderId(req.params.id);
  if (!tenderId) {
    return res.status(400).json({ error: 'Invalid tender id' });
  }

  try {
    const tender = await prisma.tender.findUnique({
      where: { id: tenderId },
      include: { criteria: true }
    });

    if (!tender) {
      return res.status(404).json({ error: 'Tender not found' });
    }

    const submissions = await prisma.tenderSubmission.findMany({
      where: { tender_id: tenderId },
      include: {
        supplier: {
          select: { id: true, name: true, email: true }
        },
        items: true,
        scores: {
          include: {
            criteria: {
              select: { id: true, name: true }
            }
          }
        }
      }
    });

    const header = [
      'Submission ID',
      'Supplier',
      'Supplier Email',
      'Status',
      'Submitted At',
      'Total Price'
    ];

    tender.criteria.forEach((criterion) => {
      header.push(`Auto Score - ${criterion.name}`);
      header.push(`Manual Score - ${criterion.name}`);
    });

    const rows = submissions.map((submission) => {
      const base = [
        submission.id,
        submission.supplier ? submission.supplier.name : '',
        submission.supplier ? submission.supplier.email || '' : '',
        submission.status,
        submission.submitted_at ? submission.submitted_at.toISOString() : '',
        submission.total_price ? parseFloat(submission.total_price).toFixed(2) : ''
      ];

      const scoreLookup = submission.scores.reduce((acc, score) => {
        acc[score.criteria_id] = score;
        return acc;
      }, {});

      tender.criteria.forEach((criterion) => {
        const score = scoreLookup[criterion.id];
        const autoScore = score && score.autoScore ? parseFloat(score.autoScore).toFixed(2) : '';
        const manualScore = score && score.manualScore ? parseFloat(score.manualScore).toFixed(2) : '';
        base.push(autoScore);
        base.push(manualScore);
      });

      return base;
    });

    const csvLines = [header, ...rows].map((line) =>
      line
        .map((value) => {
          if (value === null || value === undefined) return '';
          const str = String(value).replace(/"/g, '""');
          return /[",\n]/.test(str) ? `"${str}"` : str;
        })
        .join(',')
    );

    const csv = csvLines.join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="tender-${tenderId}-register.csv"`);
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: 'Failed to export register' });
  }
});

module.exports = router;
