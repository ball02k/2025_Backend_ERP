const express = require('express');
const router = express.Router();
const ProcurementController = require('../controllers/procurementController.js');

// Invite suppliers to a package
router.post('/packages/:packageId/invite', ProcurementController.inviteSuppliers);
// Supplier submission
router.post('/packages/:packageId/submit', ProcurementController.submitBid);
// Score a submission
router.post('/submissions/:submissionId/score', ProcurementController.scoreSubmission);
// Award a contract for a package
router.post('/packages/:packageId/award', ProcurementController.awardContract);

module.exports = router;
