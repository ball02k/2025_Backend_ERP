const express = require('express');
const router = express.Router();
const budgetCategoryService = require('../services/budgetCategory.service.cjs');
const requireAuth = require('../middleware/requireAuth.cjs');

/**
 * GET /api/budget-categories
 * Get all categories for the tenant
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    const categories = await budgetCategoryService.getCategories(
      req.user.tenantId,
      includeInactive
    );
    res.json(categories);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/budget-categories/:id
 * Get single category by ID
 */
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const category = await budgetCategoryService.getCategoryById(
      id,
      req.user.tenantId
    );
    res.json(category);
  } catch (error) {
    console.error('Error fetching category:', error);
    res.status(404).json({ error: error.message });
  }
});

/**
 * PATCH /api/budget-categories/budget-line/:id
 * Assign category to single budget line
 */
router.patch('/budget-line/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { categoryId } = req.body;

    const updated = await budgetCategoryService.assignCategoryToBudgetLine(
      id,
      categoryId,
      req.user.tenantId
    );

    res.json(updated);
  } catch (error) {
    console.error('Error assigning category:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * PATCH /api/budget-categories/budget-lines/bulk
 * Bulk assign category to multiple budget lines
 */
router.patch('/budget-lines/bulk', requireAuth, async (req, res) => {
  try {
    const { budgetLineIds, categoryId } = req.body;

    if (!Array.isArray(budgetLineIds) || budgetLineIds.length === 0) {
      return res.status(400).json({ error: 'budgetLineIds must be a non-empty array' });
    }

    await budgetCategoryService.bulkAssignCategory(
      budgetLineIds,
      categoryId,
      req.user.tenantId
    );

    res.json({ success: true, count: budgetLineIds.length });
  } catch (error) {
    console.error('Error bulk assigning:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /api/budget-categories/project/:projectId/grouped
 * Get budget lines grouped by category
 */
router.get('/project/:projectId/grouped', requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const grouped = await budgetCategoryService.getBudgetLinesByCategory(
      projectId,
      req.user.tenantId
    );
    res.json(grouped);
  } catch (error) {
    console.error('Error fetching grouped lines:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/budget-categories/project/:projectId/cvr
 * Get CVR summary by category
 */
router.get('/project/:projectId/cvr', requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const summary = await budgetCategoryService.getCategoryCVRSummary(
      projectId,
      req.user.tenantId
    );
    res.json(summary);
  } catch (error) {
    console.error('Error fetching CVR summary:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
