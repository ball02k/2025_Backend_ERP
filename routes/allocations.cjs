/**
 * Allocation Routes
 *
 * API endpoints for budget line category allocations and CVR tracking per category.
 */

const express = require('express');
const router = express.Router();
const allocationService = require('../services/allocation.service.cjs');

// Note: Authentication is applied at the app level in index.cjs

/**
 * GET /api/allocations/categories
 * Get all allocation categories for the tenant
 */
router.get('/categories', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const categories = await allocationService.getCategories(tenantId);
    res.json(categories);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/allocations/categories
 * Create a custom allocation category
 * Body: { code, name, description, sortOrder, parentId }
 */
router.post('/categories', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const userId = req.user.id.toString();
    const { code, name, description, sortOrder, parentId } = req.body;

    if (!code || !name) {
      return res.status(400).json({ error: 'Code and name are required' });
    }

    const category = await allocationService.createCategory(
      tenantId,
      { code, name, description, sortOrder, parentId },
      userId
    );

    res.status(201).json(category);
  } catch (error) {
    console.error('Error creating category:', error);
    if (error.message.includes('already exists')) {
      return res.status(409).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/allocations/budget-line/:budgetLineId
 * Get all allocations for a budget line
 */
router.get('/budget-line/:budgetLineId', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const budgetLineId = parseInt(req.params.budgetLineId, 10);

    if (isNaN(budgetLineId)) {
      return res.status(400).json({ error: 'Invalid budget line ID' });
    }

    const allocations = await allocationService.getBudgetLineAllocations(tenantId, budgetLineId);
    res.json(allocations);
  } catch (error) {
    console.error('Error fetching budget line allocations:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/allocations/budget-line/:budgetLineId
 * Create or update allocations for a budget line
 * Body: { allocations: [{ categoryId, allocatedAmount, notes }] }
 */
router.post('/budget-line/:budgetLineId', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const userId = req.user.id.toString();
    const budgetLineId = parseInt(req.params.budgetLineId, 10);
    const { allocations } = req.body;

    if (isNaN(budgetLineId)) {
      return res.status(400).json({ error: 'Invalid budget line ID' });
    }

    if (!Array.isArray(allocations) || allocations.length === 0) {
      return res.status(400).json({ error: 'Allocations array is required and must not be empty' });
    }

    // Validate each allocation has required fields
    for (const alloc of allocations) {
      if (!alloc.categoryId || alloc.allocatedAmount === undefined) {
        return res.status(400).json({
          error: 'Each allocation must have categoryId and allocatedAmount'
        });
      }
    }

    const created = await allocationService.createBudgetLineAllocations(
      tenantId,
      budgetLineId,
      allocations,
      userId
    );

    res.status(201).json(created);
  } catch (error) {
    console.error('Error creating budget line allocations:', error);
    if (error.message.includes('not equal')) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/allocations/:allocationId
 * Update a single allocation amount
 * Body: { allocatedAmount }
 */
router.patch('/:allocationId', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const userId = req.user.id.toString();
    const { allocationId } = req.params;
    const { allocatedAmount } = req.body;

    if (allocatedAmount === undefined || allocatedAmount === null) {
      return res.status(400).json({ error: 'allocatedAmount is required' });
    }

    const amount = Number(allocatedAmount);
    if (isNaN(amount) || amount < 0) {
      return res.status(400).json({ error: 'allocatedAmount must be a non-negative number' });
    }

    const updated = await allocationService.updateAllocationAmount(
      tenantId,
      allocationId,
      amount,
      userId
    );

    res.json(updated);
  } catch (error) {
    console.error('Error updating allocation:', error);
    if (error.message.includes('not equal')) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/allocations/:allocationId/cvr
 * Get CVR calculation for a single allocation
 */
router.get('/:allocationId/cvr', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { allocationId } = req.params;

    const cvr = await allocationService.calculateAllocationCVR(tenantId, allocationId);
    res.json(cvr);
  } catch (error) {
    console.error('Error calculating allocation CVR:', error);
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/allocations/budget-line/:budgetLineId/cvr
 * Get CVR for a budget line with category breakdown
 */
router.get('/budget-line/:budgetLineId/cvr', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const budgetLineId = parseInt(req.params.budgetLineId, 10);

    if (isNaN(budgetLineId)) {
      return res.status(400).json({ error: 'Invalid budget line ID' });
    }

    const cvr = await allocationService.calculateBudgetLineCVRWithAllocations(tenantId, budgetLineId);
    res.json(cvr);
  } catch (error) {
    console.error('Error calculating budget line CVR with allocations:', error);
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/allocations/project/:projectId/cvr
 * Get project-level CVR aggregated by category
 */
router.get('/project/:projectId/cvr', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const projectId = parseInt(req.params.projectId, 10);

    if (isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    const cvr = await allocationService.calculateProjectCVRByCategory(tenantId, projectId);
    res.json(cvr);
  } catch (error) {
    console.error('Error calculating project CVR by category:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/allocations/transfers
 * Create a budget transfer request between allocations
 * Body: { fromAllocationId, toAllocationId, amount, reason }
 */
router.post('/transfers', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const requestedBy = req.user.id.toString();
    const { fromAllocationId, toAllocationId, amount, reason } = req.body;

    if (!fromAllocationId || !toAllocationId || !amount || !reason) {
      return res.status(400).json({
        error: 'fromAllocationId, toAllocationId, amount, and reason are required'
      });
    }

    const transferAmount = Number(amount);
    if (isNaN(transferAmount) || transferAmount <= 0) {
      return res.status(400).json({ error: 'Amount must be a positive number' });
    }

    const transfer = await allocationService.createBudgetTransfer(
      tenantId,
      fromAllocationId,
      toAllocationId,
      transferAmount,
      reason,
      requestedBy
    );

    res.status(201).json(transfer);
  } catch (error) {
    console.error('Error creating budget transfer:', error);
    if (error.message.includes('not found') || error.message.includes('Insufficient')) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/allocations/transfers/:transferId/approve
 * Approve a budget transfer request
 */
router.post('/transfers/:transferId/approve', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const approvedBy = req.user.id.toString();
    const { transferId } = req.params;

    const transfer = await allocationService.approveBudgetTransfer(
      tenantId,
      transferId,
      approvedBy
    );

    res.json(transfer);
  } catch (error) {
    console.error('Error approving budget transfer:', error);
    if (error.message.includes('not found') || error.message.includes('already processed')) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/allocations/transfers/:transferId/reject
 * Reject a budget transfer request
 * Body: { rejectionReason }
 */
router.post('/transfers/:transferId/reject', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const rejectedBy = req.user.id.toString();
    const { transferId } = req.params;
    const { rejectionReason } = req.body;

    if (!rejectionReason) {
      return res.status(400).json({ error: 'Rejection reason is required' });
    }

    const transfer = await allocationService.rejectBudgetTransfer(
      tenantId,
      transferId,
      rejectedBy,
      rejectionReason
    );

    res.json(transfer);
  } catch (error) {
    console.error('Error rejecting budget transfer:', error);
    if (error.message.includes('not found') || error.message.includes('already processed')) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/allocations/budget-line/:budgetLineId/transfers
 * Get transfer history for a budget line
 */
router.get('/budget-line/:budgetLineId/transfers', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const budgetLineId = parseInt(req.params.budgetLineId, 10);

    if (isNaN(budgetLineId)) {
      return res.status(400).json({ error: 'Invalid budget line ID' });
    }

    const transfers = await allocationService.getBudgetLineTransfers(tenantId, budgetLineId);
    res.json(transfers);
  } catch (error) {
    console.error('Error fetching budget line transfers:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
