const express = require('express');
const requireAuth = require('../middleware/requireAuth.cjs');

const router = express.Router();

router.get('/', requireAuth, (req, res) => res.json({ user: req.user }));

module.exports = router;
