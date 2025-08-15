const express = require('express');
const { requireAuth } = require('../middleware/auth.cjs');

const router = express.Router();

router.get('/', requireAuth, (req, res) => res.json({ user: req.user }));

module.exports = router;

