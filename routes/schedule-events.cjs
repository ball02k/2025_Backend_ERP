// routes/schedule-events.cjs
// Server-Sent Events (SSE) endpoint for real-time schedule and job updates
// Route: GET /api/schedules/events

const express = require('express');
const router = express.Router();
const { sseEmitter } = require('../services/eventEmitter.cjs');

/**
 * SSE endpoint for real-time updates
 * GET /api/schedules/events
 *
 * Authentication: JWT token required
 * Query params:
 *   - lastEventId: Last event ID received (for reconnection)
 *
 * Events emitted:
 *   - job:created, job:updated, job:status_changed, job:deleted
 *   - schedule:created, schedule:updated, schedule:deleted, schedule:confirmed
 *   - worker:location_updated, worker:status_changed
 *   - time_entry:clocked_in, time_entry:clocked_out, time_entry:submitted, time_entry:approved
 */
router.get('/events', (req, res) => {
  const { tenantId, userId } = req.user;
  const lastEventId = parseInt(req.query.lastEventId || '0', 10);

  console.log(`[SSE] New connection request from user ${userId} in tenant ${tenantId}`);

  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable buffering in nginx

  // Enable CORS for SSE
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  // Flush headers immediately
  res.flushHeaders();

  // Register connection
  const connection = sseEmitter.addConnection(tenantId, userId, res, lastEventId);

  // Handle client disconnect
  req.on('close', () => {
    console.log(`[SSE] Client disconnected: user ${userId} in tenant ${tenantId}`);
    sseEmitter.removeConnection(tenantId, connection);
  });

  req.on('error', (error) => {
    console.error(`[SSE] Connection error for user ${userId}:`, error.message);
    sseEmitter.removeConnection(tenantId, connection);
  });
});

/**
 * Health check endpoint for SSE service
 * GET /api/schedules/events/health
 */
router.get('/events/health', (req, res) => {
  const { tenantId } = req.user;

  res.json({
    status: 'ok',
    totalConnections: sseEmitter.getTotalConnections(),
    tenantConnections: sseEmitter.getTenantConnectionCount(tenantId),
    uptime: process.uptime(),
  });
});

/**
 * Test endpoint to emit a test event (development only)
 * POST /api/schedules/events/test
 */
if (process.env.NODE_ENV !== 'production') {
  router.post('/events/test', (req, res) => {
    const { tenantId } = req.user;
    const { eventType, data } = req.body;

    sseEmitter.emitToTenant(tenantId, eventType || 'test:event', {
      message: 'Test event',
      ...data,
    });

    res.json({
      success: true,
      message: 'Test event emitted',
      eventType: eventType || 'test:event',
      connections: sseEmitter.getTenantConnectionCount(tenantId),
    });
  });
}

module.exports = router;
