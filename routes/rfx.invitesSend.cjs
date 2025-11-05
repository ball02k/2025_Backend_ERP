// CANONICAL: RFx Invite Sending API
// Handles sending tender invites with email template support.
// Used by the Invites tab in RfxDetails.jsx (canonical Tender UI).
// User-facing route: /api/rfx/:id/send-invites

const express = require('express');
const crypto = require('crypto');
const { requireProjectMember } = require('../middleware/membership.cjs');
const { sendEmail } = require('../lib/email.cjs');
const { renderTemplate } = require('../lib/templateRender.cjs');

module.exports = (prisma) => {
  const router = express.Router();

  function getTenantId(req) {
    return req.user && req.user.tenantId;
  }

  // Generate a unique response token for supplier invite portal access
  async function generateUniqueResponseToken(tenantId, maxAttempts = 5) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Generate 32 random bytes and encode as hex (64 characters)
      const token = crypto.randomBytes(32).toString('hex');

      // Check if token already exists for this tenant
      const existing = await prisma.requestInvite.findFirst({
        where: { tenantId, responseToken: token },
        select: { id: true }
      });

      if (!existing) {
        return token;
      }

      // Collision detected, retry
      console.warn(`[generateUniqueResponseToken] Collision detected for tenant ${tenantId}, retrying...`);
    }

    throw new Error('Failed to generate unique response token after multiple attempts');
  }

  // POST /api/rfx/:rfxId/send-invites — bulk send RFx invite emails
  router.post('/:rfxId/send-invites', requireProjectMember, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const rfxId = Number(req.params.rfxId);

      if (!Number.isFinite(rfxId)) {
        return res.status(400).json({ error: 'Invalid rfxId' });
      }

      const { invites, subject, bodyTemplate, templateId } = req.body;

      // Validate request body
      if (!Array.isArray(invites) || invites.length === 0) {
        return res.status(400).json({ error: 'invites array is required' });
      }

      // Load email template if templateId provided
      let emailTemplate = null;
      let subjectTemplate = subject;
      let bodyTemplateStr = bodyTemplate;

      if (templateId != null) {
        const tid = BigInt(templateId);
        emailTemplate = await prisma.emailTemplate.findFirst({
          where: {
            id: tid,
            tenantId: BigInt(tenantId),
          },
        });

        if (!emailTemplate) {
          return res.status(404).json({ error: 'Email template not found' });
        }

        // Use template's subject and body
        subjectTemplate = emailTemplate.subjectTemplate;
        bodyTemplateStr = emailTemplate.bodyTemplate;
      } else {
        // If no template, fall back to subject/bodyTemplate from request
        if (!subject || !subject.trim()) {
          return res.status(400).json({ error: 'subject is required when not using a template' });
        }
        if (!bodyTemplate || !bodyTemplate.trim()) {
          return res.status(400).json({ error: 'bodyTemplate is required when not using a template' });
        }
      }

      // Verify RFx exists and belongs to tenant, and load related data for template context
      const rfx = await prisma.request.findFirst({
        where: { id: rfxId, tenantId },
        include: {
          package: {
            select: {
              id: true,
              name: true,
              code: true,
              projectId: true,
              project: {
                select: {
                  id: true,
                  name: true,
                  code: true,
                },
              },
            },
          },
        },
      });

      if (!rfx) {
        return res.status(404).json({ error: 'RFx not found' });
      }

      // Note: Tenant model doesn't exist in schema, using fallback name in template context
      const tenant = null;

      // Build public app URL base
      const publicAppUrl = process.env.PUBLIC_APP_URL || 'http://localhost:5173';
      const baseUrl = publicAppUrl.replace(/\/$/, ''); // Remove trailing slash

      const results = [];

      // Process each invite
      for (const inviteData of invites) {
        let {
          supplierId,
          supplierName,
          contactFirstName,
          contactLastName,
          email
        } = inviteData;

        try {
          // If supplierId is provided, load the supplier
          let supplier = null;
          if (supplierId != null) {
            const sid = Number(supplierId);
            if (!Number.isFinite(sid)) {
              results.push({
                supplierId: supplierId,
                email: email || null,
                sent: false,
                error: 'Invalid supplier ID',
              });
              continue;
            }

            supplier = await prisma.supplier.findFirst({
              where: { id: sid, tenantId },
              select: { id: true, name: true, email: true },
            });

            if (!supplier) {
              results.push({
                supplierId: sid,
                email: email || null,
                sent: false,
                error: 'Supplier not found',
              });
              continue;
            }

            // Use supplier's email if not provided in invite
            if (!email || !email.trim()) {
              email = supplier.email;
            }

            // Use supplier's name if not provided
            if (!supplierName) {
              supplierName = supplier.name;
            }

            supplierId = sid;
          }

          // Validate email is present
          if (!email || !email.trim()) {
            results.push({
              supplierId: supplierId || null,
              email: null,
              sent: false,
              error: 'Email address is required',
            });
            continue;
          }

          // Find existing invite or prepare to create new one
          // Match on (tenantId, requestId, supplierId, email) or (tenantId, requestId, email) if supplierId is null
          const whereClause = supplierId
            ? { tenantId, requestId: rfxId, supplierId, email }
            : { tenantId, requestId: rfxId, supplierId: null, email };

          let invite = await prisma.requestInvite.findFirst({
            where: whereClause,
          });

          // Generate response token if needed
          let responseToken = invite?.responseToken;
          if (!responseToken) {
            responseToken = await generateUniqueResponseToken(tenantId);
          }

          // Upsert invite with all metadata
          const invitePayload = {
            tenantId,
            requestId: rfxId,
            supplierId: supplierId || null,
            email: email.trim(),
            supplierName: supplierName || null,
            contactFirstName: contactFirstName || null,
            contactLastName: contactLastName || null,
            status: 'invited',
            responseToken,
          };

          if (invite) {
            // Update existing invite
            invite = await prisma.requestInvite.update({
              where: { id: invite.id },
              data: invitePayload,
            });
          } else {
            // Create new invite
            invite = await prisma.requestInvite.create({
              data: invitePayload,
            });
          }

          // Build the public response link
          const link = `${baseUrl}/rfx/respond/${invite.responseToken}`;

          // Build context object for template rendering
          const ctx = {
            supplier: {
              name: supplierName || 'Supplier',
              email: email.trim(),
            },
            contact: {
              firstName: contactFirstName || '',
              lastName: contactLastName || '',
              fullName: [contactFirstName, contactLastName].filter(Boolean).join(' ') || '',
            },
            project: {
              name: rfx.package?.project?.name || '',
              code: rfx.package?.project?.code || '',
            },
            package: {
              name: rfx.package?.name || '',
              code: rfx.package?.code || '',
            },
            rfx: {
              title: rfx.title || '',
              reference: rfx.reference || '',
              deadline: rfx.deadline ? new Date(rfx.deadline).toLocaleDateString() : '',
            },
            tenant: {
              name: tenant?.name || 'Our Organization',
            },
            link,
            // Legacy placeholders for backward compatibility
            LINK: link,
            SUPPLIER_NAME: supplierName || 'Supplier',
          };

          // Render email subject and body using template context
          const renderedSubject = renderTemplate(subjectTemplate, ctx);
          const renderedBody = renderTemplate(bodyTemplateStr, ctx);

          // Send email
          await sendEmail({
            to: email.trim(),
            subject: renderedSubject.trim(),
            text: renderedBody,
          });

          // Audit log
          try {
            const { writeAudit } = require('../lib/audit.cjs');
            await writeAudit(
              tenantId,
              req.user?.id,
              'rfx_invite_email_sent',
              'RequestInvite',
              invite.id,
              {
                rfxId,
                supplierId: supplierId || null,
                email: email.trim(),
                supplierName: supplierName || null,
                contactFirstName: contactFirstName || null,
                contactLastName: contactLastName || null,
                link,
              }
            );
          } catch (auditErr) {
            console.warn('[send-invites] Audit log failed:', auditErr.message);
          }

          results.push({
            email: email.trim(),
            supplierId: supplierId || null,
            supplierName: supplierName || null,
            sent: true,
          });
        } catch (err) {
          console.error('[send-invites] Failed to process invite:', err);
          results.push({
            email: email || null,
            supplierId: supplierId || null,
            sent: false,
            error: err.message || 'Failed to send email',
          });
        }
      }

      // Return summary
      const sentCount = results.filter((r) => r.sent).length;
      const failedCount = results.length - sentCount;

      // Update email template usage stats if template was used and emails were sent
      if (emailTemplate && sentCount > 0) {
        try {
          await prisma.emailTemplate.update({
            where: { id: emailTemplate.id },
            data: {
              lastUsedAt: new Date(),
              timesUsed: { increment: sentCount },
            },
          });
        } catch (templateUpdateErr) {
          console.warn('[send-invites] Failed to update template usage:', templateUpdateErr.message);
        }
      }

      return res.json({
        ok: true,
        sent: sentCount,
        failed: failedCount,
        total: results.length,
        results,
      });
    } catch (err) {
      console.error('[send-invites] Error:', err);
      return res.status(500).json({
        error: 'Failed to send invites',
        message: err.message,
      });
    }
  });

  // POST /api/rfx/invites/:inviteId/resend — resend a single invite using the same token
  router.post('/invites/:inviteId/resend', requireProjectMember, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const inviteId = Number(req.params.inviteId);

      if (!Number.isFinite(inviteId)) {
        return res.status(400).json({ error: 'Invalid inviteId' });
      }

      // Fetch the existing invite
      const invite = await prisma.requestInvite.findFirst({
        where: { id: inviteId, tenantId },
      });

      if (!invite) {
        return res.status(404).json({ error: 'Invite not found' });
      }

      if (!invite.responseToken) {
        return res.status(400).json({ error: 'Invite has no response token' });
      }

      // Fetch the RFx with package and project details
      const rfx = await prisma.request.findFirst({
        where: { id: invite.requestId, tenantId },
        include: {
          package: {
            select: {
              id: true,
              name: true,
              projectId: true,
              project: {
                select: {
                  id: true,
                  name: true,
                  code: true,
                },
              },
            },
          },
        },
      });

      if (!rfx) {
        return res.status(400).json({ error: 'Associated tender not found' });
      }

      // Fetch supplier if supplierId exists
      let supplier = null;
      if (invite.supplierId) {
        supplier = await prisma.supplier.findFirst({
          where: { id: invite.supplierId, tenantId },
          select: { id: true, name: true, email: true },
        });
      }

      // Note: Tenant model doesn't exist in schema, using fallback name in template context
      const tenant = null;

      // Get email template (default to first template or use env fallback)
      const emailTemplate = await prisma.emailTemplate.findFirst({
        where: { tenantId, category: 'rfx_invite', isActive: true },
        orderBy: { isDefault: 'desc' },
      });

      // Subject and body templates
      const subjectTemplate = emailTemplate?.subject || process.env.EMAIL_SUBJECT_DEFAULT || 'RFx Invitation: {{rfx.title}}';
      const bodyTemplateStr = emailTemplate?.body || process.env.EMAIL_BODY_DEFAULT || `
Dear {{supplier.name}},

You are invited to respond to: {{rfx.title}}

Please use the following link to access the tender:
{{link}}

Deadline: {{rfx.deadline}}

Best regards,
{{tenant.name}}
      `.trim();

      // Build base URL for response links
      const protocol = process.env.NODE_ENV === 'production' ? 'https' : req.protocol;
      const host = req.get('host');
      const baseUrl = process.env.PUBLIC_URL || `${protocol}://${host}`;

      // Build the public response link using the SAME token
      const link = `${baseUrl}/rfx/respond/${invite.responseToken}`;

      // Build context object for template rendering
      const ctx = {
        supplier: {
          name: invite.supplierName || supplier?.name || 'Supplier',
          email: invite.email,
        },
        contact: {
          firstName: invite.contactFirstName || '',
          lastName: invite.contactLastName || '',
          fullName: [invite.contactFirstName, invite.contactLastName].filter(Boolean).join(' ') || '',
        },
        project: {
          name: rfx.package?.project?.name || '',
          code: rfx.package?.project?.code || '',
        },
        package: {
          name: rfx.package?.name || '',
          code: rfx.package?.code || '',
        },
        rfx: {
          title: rfx.title || '',
          reference: rfx.reference || '',
          deadline: rfx.deadline ? new Date(rfx.deadline).toLocaleDateString() : '',
        },
        tenant: {
          name: tenant?.name || 'Our Organization',
        },
        link,
        // Legacy placeholders for backward compatibility
        LINK: link,
        SUPPLIER_NAME: invite.supplierName || supplier?.name || 'Supplier',
      };

      // Render email subject and body using template context
      const renderedSubject = renderTemplate(subjectTemplate, ctx);
      const renderedBody = renderTemplate(bodyTemplateStr, ctx);

      // Send email
      await sendEmail({
        to: invite.email,
        subject: renderedSubject.trim(),
        text: renderedBody,
      });

      // Update lastSentAt timestamp
      await prisma.requestInvite.update({
        where: { id: inviteId },
        data: { lastSentAt: new Date() },
      });

      // Audit log
      try {
        const { writeAudit } = require('../lib/audit.cjs');
        await writeAudit(
          tenantId,
          req.user?.id,
          'rfx_invite_resent',
          'RequestInvite',
          invite.id,
          {
            rfxId: rfx.id,
            supplierId: invite.supplierId,
            email: invite.email,
            supplierName: invite.supplierName,
            link,
            responseToken: invite.responseToken,
          }
        );
      } catch (auditErr) {
        console.warn('[resend-invite] Audit log failed:', auditErr.message);
      }

      // Update email template usage stats if template was used
      if (emailTemplate) {
        try {
          await prisma.emailTemplate.update({
            where: { id: emailTemplate.id },
            data: {
              lastUsedAt: new Date(),
              timesUsed: { increment: 1 },
            },
          });
        } catch (templateUpdateErr) {
          console.warn('[resend-invite] Failed to update template usage:', templateUpdateErr.message);
        }
      }

      return res.json({
        ok: true,
        message: 'Invite resent successfully',
        inviteId: invite.id,
        email: invite.email,
        responseToken: invite.responseToken,
      });
    } catch (err) {
      console.error('[resend-invite] Error:', err);
      return res.status(500).json({
        error: 'Failed to resend invite',
        message: err.message,
      });
    }
  });

  // POST /api/rfx/invites/:inviteId/remove — remove/delete an invite
  router.post('/invites/:inviteId/remove', requireProjectMember, async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const inviteId = Number(req.params.inviteId);

      if (!Number.isFinite(inviteId)) {
        return res.status(400).json({ error: 'Invalid inviteId' });
      }

      // Verify invite exists and belongs to tenant
      const invite = await prisma.requestInvite.findFirst({
        where: { id: inviteId, tenantId },
        select: { id: true, requestId: true, email: true, supplierName: true },
      });

      if (!invite) {
        return res.status(404).json({ error: 'Invite not found' });
      }

      // Delete the invite
      await prisma.requestInvite.delete({
        where: { id: inviteId },
      });

      // Audit log
      try {
        const { writeAudit } = require('../lib/audit.cjs');
        await writeAudit(
          tenantId,
          req.user?.id,
          'rfx_invite_removed',
          'RequestInvite',
          inviteId,
          {
            rfxId: invite.requestId,
            email: invite.email,
            supplierName: invite.supplierName,
          }
        );
      } catch (auditErr) {
        console.warn('[remove-invite] Audit log failed:', auditErr.message);
      }

      return res.json({
        ok: true,
        message: 'Invite removed successfully',
        inviteId,
      });
    } catch (err) {
      console.error('[remove-invite] Error:', err);
      return res.status(500).json({
        error: 'Failed to remove invite',
        message: err.message,
      });
    }
  });

  return router;
};
