const express = require('express');
const router = express.Router();
const { requireProjectMember } = require('../middleware/membership.cjs');
const { prisma } = require('../utils/prisma.cjs');
const { upsertSupplierForOnboarding } = require('../services/suppliers.cjs');
const crypto = require('crypto');

function isPMorQS(req) {
  const roles = Array.isArray(req.user?.roles) ? req.user.roles : [];
  const rset = new Set(roles.map((r) => String(r).toLowerCase()));
  if (rset.has('admin')) return true;
  if (rset.has('pm') || rset.has('project_manager')) return true;
  if (rset.has('qs') || rset.has('quantity_surveyor')) return true;
  // Also honor membership role if present
  const mRole = String(req.membership?.role || '').toLowerCase();
  if (mRole === 'pm' || mRole === 'qs') return true;
  return false;
}

function ensureTenant(where, tenantId) {
  return { ...where, tenantId };
}

// Basic summary endpoint for onboarding root to avoid 404s on /api/onboarding
router.get('/', async (req, res) => {
  try {
    const tenantId = req.user?.tenantId;
    const [forms, invites, responses] = await Promise.all([
      prisma.onboardingForm?.count ? prisma.onboardingForm.count({ where: { tenantId } }) : Promise.resolve(0),
      prisma.onboardingInvite?.count ? prisma.onboardingInvite.count({ where: { tenantId } }) : Promise.resolve(0),
      prisma.onboardingResponse?.count ? prisma.onboardingResponse.count({ where: { tenantId } }) : Promise.resolve(0),
    ]);
    res.json({ ok: true, totals: { forms, invites, responses } });
  } catch (e) {
    res.json({ ok: true, totals: { forms: 0, invites: 0, responses: 0 } });
  }
});

// ---- Projects ----
router.get('/projects', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const rows = await prisma.onboardingProject.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ data: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to list onboarding projects' });
  }
});

router.post('/projects', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { name, status } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name is required' });
    const created = await prisma.onboardingProject.create({
      data: { tenantId, name: String(name), ...(status ? { status: String(status) } : {}) },
    });
    res.json(created);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

router.patch('/projects/:id', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const id = Number(req.params.id);
    const { name, status } = req.body || {};
    const updated = await prisma.onboardingProject.update({
      where: { id },
      data: { ...(name ? { name: String(name) } : {}), ...(status ? { status: String(status) } : {}) },
    });
    if (updated.tenantId !== tenantId)
      return res.status(403).json({ error: 'CROSS_TENANT_WRITE_FORBIDDEN' });
    res.json(updated);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to update project' });
  }
});

// ---- Forms ----
router.post('/forms', requireProjectMember, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { id, projectId, title, sections, publish, version } = req.body || {};
    const pid = Number(projectId);
    if (!Number.isFinite(pid)) return res.status(400).json({ error: 'projectId is required' });
    if (!title) return res.status(400).json({ error: 'title is required' });

    const payload = {
      tenantId,
      projectId: pid,
      title: String(title),
      ...(version ? { version: String(version) } : {}),
      ...(sections != null ? { sections } : {}),
      ...(publish != null ? { isPublished: !!publish } : {}),
    };

    // Only PM/admin can publish a form
    if (publish === true) {
      const roles = Array.isArray(req.user?.roles) ? req.user.roles.map((r) => String(r).toLowerCase()) : [];
      const isPM = roles.includes('pm') || roles.includes('project_manager') || roles.includes('admin') || String(req.membership?.role || '').toLowerCase() === 'pm';
      if (!isPM) return res.status(403).json({ error: 'PUBLISH_REQUIRES_PM' });
    }

    let row;
    if (id) {
      row = await prisma.onboardingForm.update({ where: { id: Number(id) }, data: payload });
    } else {
      row = await prisma.onboardingForm.create({ data: payload });
    }
    res.json(row);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to create/update form' });
  }
});

// ---- Invites ----
router.post('/invites', requireProjectMember, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { projectId, supplierId, email } = req.body || {};
    if (!projectId || !supplierId || !email)
      return res.status(400).json({ error: 'projectId, supplierId, email are required' });
    const token = crypto.randomBytes(16).toString('hex');
    const created = await prisma.onboardingInvite.create({
      data: {
        tenantId,
        projectId: Number(projectId),
        supplierId: Number(supplierId),
        email: String(email).toLowerCase(),
        token,
        status: 'invited',
      },
    });
    res.json(created);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to create invite' });
  }
});

// ---- Progress ----
router.get('/progress', requireProjectMember, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const projectId = Number(req.query.projectId);
    if (!Number.isFinite(projectId)) return res.status(400).json({ error: 'projectId is required' });
    const [invited, accepted, readyForReview, approved] = await Promise.all([
      prisma.onboardingInvite.count({ where: { tenantId, projectId, status: 'invited' } }),
      prisma.onboardingInvite.count({ where: { tenantId, projectId, status: 'accepted' } }),
      prisma.onboardingResponse.count({ where: { tenantId, projectId, status: 'ready_for_review' } }),
      prisma.onboardingResponse.count({ where: { tenantId, projectId, status: 'approved' } }),
    ]);

    res.json({ data: { invited, accepted, readyForReview, approved } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to compute progress' });
  }
});

// ---- Responses ----
function validateSubmission(sections, answers, files) {
  const errors = [];
  const secArray = Array.isArray(sections) ? sections : [];
  const fileMap = new Map();
  if (Array.isArray(files)) {
    for (const f of files) {
      if (f && f.key) fileMap.set(f.key, f);
    }
  }
  for (const sec of secArray) {
    const fields = Array.isArray(sec?.fields) ? sec.fields : [];
    for (const fld of fields) {
      const key = fld?.key;
      if (!key) continue;
      const type = String(fld?.type || '').toLowerCase();
      const required = !!fld?.required;
      const val = answers?.[key];
      if (required) {
        const empty = val == null || (typeof val === 'string' && val.trim() === '') || (Array.isArray(val) && val.length === 0);
        if (empty) errors.push({ field: key, error: 'REQUIRED' });
      }
      if (type.includes('file') && required) {
        const meta = fileMap.get(key);
        if (!meta || !meta.documentId) errors.push({ field: key, error: 'FILE_REQUIRED' });
        // basic size stub (if provided)
        if (meta?.size && Number(meta.size) > 25 * 1024 * 1024) {
          errors.push({ field: key, error: 'FILE_TOO_LARGE' });
        }
      }
    }
  }
  return errors;
}

router.post('/responses/submit', requireProjectMember, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { projectId, supplierId, formId, answers, files, submit } = req.body || {};
    const pid = Number(projectId);
    const sid = Number(supplierId);
    const fid = Number(formId);
    if (!Number.isFinite(pid) || !Number.isFinite(sid) || !Number.isFinite(fid))
      return res.status(400).json({ error: 'projectId, supplierId, formId required' });

    const form = await prisma.onboardingForm.findFirst({ where: { id: fid, tenantId } });
    if (!form) return res.status(404).json({ error: 'Form not found' });
    if (form.isPublished !== true) return res.status(400).json({ error: 'FORM_NOT_PUBLISHED' });

    const validation = validateSubmission(form.sections, answers, files);
    if (validation.length) return res.status(400).json({ error: 'VALIDATION_FAILED', details: validation });

    const status = submit ? 'ready_for_review' : 'in_progress';
    const submittedAt = submit ? new Date() : null;
    const created = await prisma.onboardingResponse.create({
      data: {
        tenantId,
        projectId: pid,
        supplierId: sid,
        formId: fid,
        answers,
        files,
        status,
        ...(submittedAt ? { submittedAt } : {}),
      },
    });
    // Auto-mark any pending invite as accepted on first submission
    await prisma.onboardingInvite.updateMany({
      where: { tenantId, projectId: pid, supplierId: sid, status: 'invited' },
      data: { status: 'accepted', respondedAt: new Date() },
    });
    res.json(created);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to submit response' });
  }
});

router.patch('/responses/:id/review', requireProjectMember, async (req, res) => {
  try {
    if (!isPMorQS(req)) return res.status(403).json({ error: 'REVIEW_PERMISSION_REQUIRED' });
    const tenantId = req.user.tenantId;
    const id = Number(req.params.id);
    const { decision, notes } = req.body || {};
    if (!decision) return res.status(400).json({ error: 'decision is required' });
    const existing = await prisma.onboardingResponse.findFirst({ where: { id, tenantId } });
    if (!existing) return res.status(404).json({ error: 'Response not found' });

    // If approved and no supplier linked yet, upsert and link a Supplier
    let supplierId = existing.supplierId || null;
    if (String(decision) === 'approved' && !supplierId) {
      const answers = existing.answers || {};
      const profile = {
        name: answers.companyName || answers.supplierName || 'Unnamed Supplier',
        companyRegNo: answers.companyRegNo || answers.companyNumber || null,
        vatNo: answers.vatNo || answers.vatNumber || null,
      };
      const emails = Array.isArray(answers.emails)
        ? answers.emails
        : answers.primaryEmail
        ? [answers.primaryEmail]
        : [];
      try {
        const sup = await upsertSupplierForOnboarding({ tenantId, profile, emails });
        supplierId = sup.id;
      } catch (e) {
        // Fail the review if we cannot link/create a supplier
        return res.status(500).json({ error: 'SUPPLIER_LINK_FAILED' });
      }
    }

    const updated = await prisma.onboardingResponse.update({
      where: { id },
      data: {
        supplierId: supplierId,
        status:
          decision === 'approved'
            ? 'approved'
            : decision === 'declined'
            ? 'declined'
            : existing.status,
        decision: String(decision),
        reviewedBy: Number(req.user.id),
        reviewedAt: new Date(),
        // keep notes in answers meta if provided
        ...(notes ? { answers: { ...(existing.answers || {}), _reviewNotes: String(notes) } } : {}),
      },
    });
    res.json({ data: updated, linkedSupplierId: supplierId || null, note: notes ? String(notes) : null });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to review response' });
  }
});

module.exports = router;
// ---- Listings ----
router.get('/forms', requireProjectMember, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const projectId = Number(req.query.projectId);
    if (!Number.isFinite(projectId)) return res.status(400).json({ error: 'projectId is required' });
    const rows = await prisma.onboardingForm.findMany({
      where: { tenantId, projectId },
      orderBy: [{ isPublished: 'desc' }, { id: 'desc' }],
    });
    res.json({ data: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to list forms' });
  }
});

router.get('/invites', requireProjectMember, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const projectId = Number(req.query.projectId);
    if (!Number.isFinite(projectId)) return res.status(400).json({ error: 'projectId is required' });
    const rows = await prisma.onboardingInvite.findMany({
      where: { tenantId, projectId },
      orderBy: { invitedAt: 'desc' },
    });
    res.json({ data: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to list invites' });
  }
});

router.get('/responses', requireProjectMember, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const projectId = Number(req.query.projectId);
    const supplierId = req.query.supplierId ? Number(req.query.supplierId) : undefined;
    if (!Number.isFinite(projectId)) return res.status(400).json({ error: 'projectId is required' });
    const where = { tenantId, projectId, ...(Number.isFinite(supplierId) ? { supplierId } : {}) };
    const rows = await prisma.onboardingResponse.findMany({
      where,
      orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
    });
    res.json({ data: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to list responses' });
  }
});

// Optional: mark invite accepted by token (requires membership for safety)
router.post('/invites/accept', requireProjectMember, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ error: 'token is required' });
    const updated = await prisma.onboardingInvite.updateMany({
      where: { tenantId, token: String(token) },
      data: { status: 'accepted', respondedAt: new Date() },
    });
    res.json({ updated: updated.count });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to accept invite' });
  }
});
