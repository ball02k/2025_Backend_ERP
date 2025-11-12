/**
 * Project Role Assignment API
 *
 * Manages role assignments on projects for the approval framework.
 * Project roles determine who can approve various entities (packages, contracts, etc.)
 *
 * Routes:
 * - GET    /api/projects/:projectId/roles - List project roles
 * - POST   /api/projects/:projectId/roles - Assign role
 * - PUT    /api/projects/:projectId/roles/:roleId - Update role
 * - DELETE /api/projects/:projectId/roles/:roleId - Remove role
 * - PUT    /api/projects/:projectId/roles/:roleId/deputy - Assign deputy
 * - GET    /api/projects/:projectId/roles/available - Get available roles
 */

const express = require('express');
const prisma = require('../lib/prisma.cjs');
const requireAuth = require('../middleware/requireAuth.cjs');
const { requirePerm } = require('../middleware/checkPermission.cjs');

const router = express.Router();

// All routes require authentication
router.use(requireAuth);

/**
 * GET /api/projects/:projectId/roles
 * List all role assignments for a project
 */
router.get('/:projectId/roles', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { tenantId } = req.user;
    const { isActive } = req.query;

    // Verify project belongs to tenant
    const project = await prisma.project.findFirst({
      where: {
        id: parseInt(projectId),
        tenantId
      }
    });

    if (!project) {
      return res.status(404).json({
        error: 'Project not found'
      });
    }

    const where = {
      projectId: parseInt(projectId)
    };

    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }

    const roles = await prisma.projectRole.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        },
        deputy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        },
        _count: {
          select: {
            approvalSteps: true
          }
        }
      },
      orderBy: [
        { role: 'asc' },
        { startDate: 'desc' }
      ]
    });

    res.json({ roles });
  } catch (error) {
    console.error('[Project Roles] Error listing roles:', error);
    res.status(500).json({
      error: 'Failed to list project roles',
      message: error.message
    });
  }
});

/**
 * GET /api/projects/:projectId/roles/available
 * Get list of available roles that can be assigned
 */
router.get('/:projectId/roles/available', async (req, res) => {
  try {
    // Return all possible ProjectRoleType enum values
    const availableRoles = [
      'PROJECT_MANAGER',
      'COMMERCIAL_MANAGER',
      'CONSTRUCTION_MANAGER',
      'PACKAGE_MANAGER',
      'DESIGN_LEAD',
      'QS_COST_MANAGER',
      'PLANNING_ENGINEER',
      'HSQE_MANAGER',
      'SITE_MANAGER',
      'PROJECT_DIRECTOR',
      'CONTRACTS_MANAGER',
      'PROCUREMENT_MANAGER',
      'CLIENT_REPRESENTATIVE',
      'QUANTITY_SURVEYOR'
    ];

    res.json({ roles: availableRoles });
  } catch (error) {
    console.error('[Project Roles] Error getting available roles:', error);
    res.status(500).json({
      error: 'Failed to get available roles',
      message: error.message
    });
  }
});

/**
 * POST /api/projects/:projectId/roles
 * Assign a role to a user on a project
 */
router.post('/:projectId/roles', requirePerm('project_manage'), async (req, res) => {
  try {
    const { projectId } = req.params;
    const { tenantId } = req.user;
    const {
      userId,
      role,
      deputyUserId,
      canApprovePackages,
      canApproveContracts,
      canApproveVariations,
      canApprovePayments,
      receiveNotifications,
      notificationPreference,
      startDate,
      endDate
    } = req.body;

    // Validation
    if (!userId || !role) {
      return res.status(400).json({
        error: 'Missing required fields: userId, role'
      });
    }

    // Verify project belongs to tenant
    const project = await prisma.project.findFirst({
      where: {
        id: parseInt(projectId),
        tenantId
      }
    });

    if (!project) {
      return res.status(404).json({
        error: 'Project not found'
      });
    }

    // Verify user exists and belongs to tenant
    const user = await prisma.user.findFirst({
      where: {
        id: userId,
        tenantId
      }
    });

    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }

    // Check if role assignment already exists
    const existing = await prisma.projectRole.findFirst({
      where: {
        projectId: parseInt(projectId),
        userId,
        role,
        isActive: true
      }
    });

    if (existing) {
      return res.status(400).json({
        error: 'User already has this role on the project',
        existingRole: existing
      });
    }

    // Create role assignment
    const projectRole = await prisma.projectRole.create({
      data: {
        projectId: parseInt(projectId),
        userId,
        role,
        deputyUserId: deputyUserId || null,
        canApprovePackages: canApprovePackages || false,
        canApproveContracts: canApproveContracts || false,
        canApproveVariations: canApproveVariations || false,
        canApprovePayments: canApprovePayments || false,
        receiveNotifications: receiveNotifications !== false,
        notificationPreference: notificationPreference || 'EMAIL_AND_IN_APP',
        startDate: startDate ? new Date(startDate) : new Date(),
        endDate: endDate ? new Date(endDate) : null,
        isActive: true
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        },
        deputy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        }
      }
    });

    console.log(`[Project Roles] Assigned ${role} to user ${userId} on project ${projectId}`);

    res.status(201).json({ projectRole });
  } catch (error) {
    console.error('[Project Roles] Error creating role:', error);
    res.status(500).json({
      error: 'Failed to create project role',
      message: error.message
    });
  }
});

/**
 * PUT /api/projects/:projectId/roles/:roleId
 * Update a project role assignment
 */
router.put('/:projectId/roles/:roleId', requirePerm('project_manage'), async (req, res) => {
  try {
    const { projectId, roleId } = req.params;
    const { tenantId } = req.user;
    const {
      deputyUserId,
      canApprovePackages,
      canApproveContracts,
      canApproveVariations,
      canApprovePayments,
      receiveNotifications,
      notificationPreference,
      startDate,
      endDate,
      isActive
    } = req.body;

    // Verify role exists and belongs to project in tenant
    const existing = await prisma.projectRole.findFirst({
      where: {
        id: roleId,
        projectId: parseInt(projectId),
        project: {
          tenantId
        }
      }
    });

    if (!existing) {
      return res.status(404).json({
        error: 'Project role not found'
      });
    }

    // Build update data
    const updateData = {};
    if (deputyUserId !== undefined) updateData.deputyUserId = deputyUserId;
    if (canApprovePackages !== undefined) updateData.canApprovePackages = canApprovePackages;
    if (canApproveContracts !== undefined) updateData.canApproveContracts = canApproveContracts;
    if (canApproveVariations !== undefined) updateData.canApproveVariations = canApproveVariations;
    if (canApprovePayments !== undefined) updateData.canApprovePayments = canApprovePayments;
    if (receiveNotifications !== undefined) updateData.receiveNotifications = receiveNotifications;
    if (notificationPreference !== undefined) updateData.notificationPreference = notificationPreference;
    if (startDate !== undefined) updateData.startDate = new Date(startDate);
    if (endDate !== undefined) updateData.endDate = endDate ? new Date(endDate) : null;
    if (isActive !== undefined) updateData.isActive = isActive;

    const projectRole = await prisma.projectRole.update({
      where: { id: roleId },
      data: updateData,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        },
        deputy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        }
      }
    });

    console.log(`[Project Roles] Updated role ${roleId} on project ${projectId}`);

    res.json({ projectRole });
  } catch (error) {
    console.error('[Project Roles] Error updating role:', error);
    res.status(500).json({
      error: 'Failed to update project role',
      message: error.message
    });
  }
});

/**
 * DELETE /api/projects/:projectId/roles/:roleId
 * Remove a project role assignment (soft delete by deactivating)
 */
router.delete('/:projectId/roles/:roleId', requirePerm('project_manage'), async (req, res) => {
  try {
    const { projectId, roleId } = req.params;
    const { tenantId } = req.user;

    // Verify role exists
    const existing = await prisma.projectRole.findFirst({
      where: {
        id: roleId,
        projectId: parseInt(projectId),
        project: {
          tenantId
        }
      },
      include: {
        _count: {
          select: {
            approvalSteps: true
          }
        }
      }
    });

    if (!existing) {
      return res.status(404).json({
        error: 'Project role not found'
      });
    }

    // Check if role has approval steps assigned
    if (existing._count.approvalSteps > 0) {
      // Soft delete - deactivate instead of removing
      await prisma.projectRole.update({
        where: { id: roleId },
        data: {
          isActive: false,
          endDate: new Date()
        }
      });

      console.log(`[Project Roles] Deactivated role ${roleId} (has approval steps assigned)`);

      return res.json({
        message: 'Role deactivated',
        note: 'Role has approval steps assigned and was deactivated instead of deleted'
      });
    }

    // Hard delete if no approval steps
    await prisma.projectRole.delete({
      where: { id: roleId }
    });

    console.log(`[Project Roles] Deleted role ${roleId}`);

    res.json({
      message: 'Role deleted'
    });
  } catch (error) {
    console.error('[Project Roles] Error deleting role:', error);
    res.status(500).json({
      error: 'Failed to delete project role',
      message: error.message
    });
  }
});

/**
 * PUT /api/projects/:projectId/roles/:roleId/deputy
 * Assign or update deputy for a role
 */
router.put('/:projectId/roles/:roleId/deputy', requirePerm('project_manage'), async (req, res) => {
  try {
    const { projectId, roleId } = req.params;
    const { tenantId } = req.user;
    const { deputyUserId } = req.body;

    // Verify role exists
    const existing = await prisma.projectRole.findFirst({
      where: {
        id: roleId,
        projectId: parseInt(projectId),
        project: {
          tenantId
        }
      }
    });

    if (!existing) {
      return res.status(404).json({
        error: 'Project role not found'
      });
    }

    // Verify deputy user exists if provided
    if (deputyUserId) {
      const deputyUser = await prisma.user.findFirst({
        where: {
          id: deputyUserId,
          tenantId
        }
      });

      if (!deputyUser) {
        return res.status(404).json({
          error: 'Deputy user not found'
        });
      }

      // Can't be deputy to yourself
      if (deputyUserId === existing.userId) {
        return res.status(400).json({
          error: 'User cannot be their own deputy'
        });
      }
    }

    const projectRole = await prisma.projectRole.update({
      where: { id: roleId },
      data: {
        deputyUserId: deputyUserId || null
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        },
        deputy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        }
      }
    });

    console.log(`[Project Roles] ${deputyUserId ? 'Assigned' : 'Removed'} deputy for role ${roleId}`);

    res.json({ projectRole });
  } catch (error) {
    console.error('[Project Roles] Error updating deputy:', error);
    res.status(500).json({
      error: 'Failed to update deputy',
      message: error.message
    });
  }
});

/**
 * GET /api/projects/:projectId/roles/by-user/:userId
 * Get all roles for a specific user on a project
 */
router.get('/:projectId/roles/by-user/:userId', async (req, res) => {
  try {
    const { projectId, userId } = req.params;
    const { tenantId } = req.user;

    const roles = await prisma.projectRole.findMany({
      where: {
        projectId: parseInt(projectId),
        userId: parseInt(userId),
        isActive: true,
        project: {
          tenantId
        }
      },
      include: {
        deputy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        }
      }
    });

    res.json({ roles });
  } catch (error) {
    console.error('[Project Roles] Error getting user roles:', error);
    res.status(500).json({
      error: 'Failed to get user roles',
      message: error.message
    });
  }
});

module.exports = router;
