const { prisma, Prisma } = require('../utils/prisma.cjs');
const { writeAudit } = require('../lib/audit.cjs');
const { createContract } = require('../services/contracts.cjs');

// Invite suppliers to a package
exports.inviteSuppliers = async (req, res) => {
  try {
    const packageId = Number(req.params.packageId);
    const { supplierIds } = req.body;
    const invitesData = supplierIds.map((suppId) => ({
      packageId,
      supplierId: suppId,
    }));
    const invites = await prisma.tenderInvite.createMany({ data: invitesData });
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        entity: 'Package',
        entityId: String(packageId),
        action: 'INVITE',
        changes: { set: { invitedSuppliers: supplierIds } }
      }
    });
    res.status(201).json({ message: `Invited ${invites.count} suppliers` });
  } catch (err) {
    console.error('Error inviting suppliers:', err);
    res.status(500).json({ error: 'Failed to invite suppliers' });
  }
};

// Supplier submits a bid
exports.submitBid = async (req, res) => {
  try {
    const packageId = Number(req.params.packageId);
    const { supplierId, price, durationWeeks, details } = req.body;
    const invite = await prisma.tenderInvite.findUnique({
      where: { packageId_supplierId: { packageId, supplierId } }
    });
    if (!invite) return res.status(400).json({ error: 'Supplier was not invited to this package' });
    const submission = await prisma.submission.create({
      data: {
        packageId,
        supplierId,
        price: price ? new Prisma.Decimal(price) : null,
        durationWeeks,
        details: details ? details : undefined,
      }
    });
    await prisma.tenderInvite.update({
      where: { packageId_supplierId: { packageId, supplierId } },
      data: { status: 'Submitted', respondedAt: new Date() }
    });
    const submissions = await prisma.submission.findMany({ where: { packageId } });
    if (submissions.length > 0 && submission.price) {
      const prices = submissions.filter(s => s.price != null).map(s => Number(s.price));
      const minPrice = Math.min(...prices);
      if (minPrice > 0) {
        const priceScore = minPrice / Number(submission.price) * 100;
        await prisma.submission.update({
          where: { id: submission.id },
          data: { priceScore }
        });
        submission.priceScore = priceScore;
      }
    }
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        entity: 'Submission',
        entityId: String(submission.id),
        action: 'CREATE',
        changes: { set: { price, duration: durationWeeks } }
      }
    });
    res.status(201).json(submission);
  } catch (err) {
    console.error('Error submitting bid:', err);
    res.status(500).json({ error: 'Failed to submit bid' });
  }
};

// Record evaluator scores for a submission
exports.scoreSubmission = async (req, res) => {
  try {
    const submissionId = Number(req.params.submissionId);
    const { technicalScore, override } = req.body;
    const submission = await prisma.submission.findUnique({ where: { id: submissionId } });
    if (!submission) return res.status(404).json({ error: 'Submission not found' });
    const dataUpdate = {};
    if (technicalScore !== undefined) dataUpdate.technicalScore = technicalScore;
    if (override && override.overallScore !== undefined) {
      dataUpdate.overallScore = override.overallScore;
    } else {
      const tScore = technicalScore !== undefined ? technicalScore : submission.technicalScore;
      const pScore = submission.priceScore;
      if (tScore != null && pScore != null) {
        dataUpdate.overallScore = 0.6 * Number(tScore) + 0.4 * Number(pScore);
      }
    }
    const updated = await prisma.submission.update({
      where: { id: submissionId },
      data: dataUpdate
    });
    const allSubs = await prisma.submission.findMany({ where: { packageId: submission.packageId } });
    const ranked = allSubs.sort((a, b) => (b.overallScore || 0) - (a.overallScore || 0));
    for (let rank = 0; rank < ranked.length; rank++) {
      const subId = ranked[rank].id;
      await prisma.submission.update({ where: { id: subId }, data: { rank: rank + 1 } });
      if (subId === submissionId) updated.rank = rank + 1;
    }
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        entity: 'Submission',
        entityId: String(submissionId),
        action: 'SCORE',
        changes: { set: { technicalScore, overallScore: updated.overallScore } }
      }
    });
    res.json({ message: 'Score recorded', submission: updated });
  } catch (err) {
    console.error('Error scoring submission:', err);
    res.status(500).json({ error: 'Failed to score submission' });
  }
};

// Award a contract for a package
exports.awardContract = async (req, res) => {
  try {
    const packageId = Number(req.params.packageId);
    const tenantId = req.user?.tenantId || req.tenantId || 'demo';
    const { supplierId, contractValue, currency, contractType, startDate, endDate, budgetLineIds } = req.body || {};
    if (supplierId == null) return res.status(400).json({ error: 'supplierId required' });
    const pkg = await prisma.package.findFirst({
      where: { id: packageId, project: { tenantId } },
      select: { id: true, projectId: true },
    });
    if (!pkg) return res.status(404).json({ error: 'Package not found' });

    const contract = await createContract({
      tenantId,
      userId: req.user?.id,
      req,
      data: {
        projectId: pkg.projectId,
        packageId,
        supplierId,
        title: req.body?.title || `Contract for Package ${packageId}`,
        awardValue: contractValue,
        currency: currency || 'GBP',
        contractType: contractType || null,
        startDate,
        endDate,
        budgetLineIds: budgetLineIds || [],
      },
    });

    const awardValueNumber = contract?.value != null ? Number(contract.value) : Number(contractValue || 0);
    await prisma.package.update({
      where: { id: packageId },
      data: {
        status: 'Awarded',
        awardSupplierId: supplierId,
        awardValue: awardValueNumber,
      },
    });
    await prisma.submission.updateMany({
      where: { packageId },
      data: { status: 'Awarded' }
    });
    await writeAudit({
      prisma,
      req,
      userId: req.user?.id,
      entity: 'Package',
      entityId: packageId,
      action: 'AWARD_CONTRACT',
      changes: { awardedTo: supplierId, contractId: contract?.id, awardValue: awardValueNumber },
    });
    res.status(201).json({ message: 'Contract awarded', contractId: contract?.id, contract });
  } catch (err) {
    console.error('Error awarding contract:', err);
    if (err && err.status) return res.status(err.status).json({ error: err.message });
    res.status(500).json({ error: 'Failed to award contract' });
  }
};
