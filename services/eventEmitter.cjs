// services/eventEmitter.cjs
// Server-Sent Events (SSE) service for real-time updates
// Manages connections, emits events with tenant scoping

const { EventEmitter } = require('events');

class SSEEventEmitter extends EventEmitter {
  constructor() {
    super();
    // Map of tenantId -> Set of { res, userId, lastEventId }
    this.connections = new Map();

    // Keep track of recent events for reconnection (last 50 events per tenant)
    this.eventHistory = new Map();
    this.maxHistorySize = 50;
  }

  /**
   * Register a new SSE connection for a tenant
   * @param {string} tenantId - Tenant ID
   * @param {string} userId - User ID
   * @param {Response} res - Express response object
   * @param {number} lastEventId - Last event ID received by client (for reconnection)
   */
  addConnection(tenantId, userId, res, lastEventId = 0) {
    if (!this.connections.has(tenantId)) {
      this.connections.set(tenantId, new Set());
    }

    const connection = { res, userId, lastEventId, connectedAt: Date.now() };
    this.connections.get(tenantId).add(connection);

    console.log(`[SSE] New connection for tenant ${tenantId}, user ${userId}. Total connections: ${this.getTotalConnections()}`);

    // Send missed events if reconnecting
    if (lastEventId > 0) {
      this.sendMissedEvents(tenantId, connection, lastEventId);
    }

    // Send initial connection event
    this.sendToConnection(connection, {
      type: 'connected',
      data: { message: 'Connected to real-time updates', timestamp: new Date().toISOString() },
      id: Date.now(),
    });

    return connection;
  }

  /**
   * Remove a connection when client disconnects
   */
  removeConnection(tenantId, connection) {
    const tenantConnections = this.connections.get(tenantId);
    if (tenantConnections) {
      tenantConnections.delete(connection);
      if (tenantConnections.size === 0) {
        this.connections.delete(tenantId);
      }
    }
    console.log(`[SSE] Connection closed for tenant ${tenantId}. Total connections: ${this.getTotalConnections()}`);
  }

  /**
   * Send missed events to a reconnecting client
   */
  sendMissedEvents(tenantId, connection, lastEventId) {
    const history = this.eventHistory.get(tenantId);
    if (!history) return;

    const missedEvents = history.filter(event => event.id > lastEventId);
    missedEvents.forEach(event => {
      this.sendToConnection(connection, event);
    });

    console.log(`[SSE] Sent ${missedEvents.length} missed events to reconnecting client`);
  }

  /**
   * Send event to a specific connection
   */
  sendToConnection(connection, event) {
    try {
      const { res } = connection;

      // SSE format: id, event, data
      if (event.id) {
        res.write(`id: ${event.id}\n`);
      }
      if (event.type) {
        res.write(`event: ${event.type}\n`);
      }
      res.write(`data: ${JSON.stringify(event.data)}\n\n`);
    } catch (error) {
      console.error('[SSE] Error sending to connection:', error.message);
    }
  }

  /**
   * Emit event to all connections for a specific tenant
   */
  emitToTenant(tenantId, eventType, data) {
    const tenantConnections = this.connections.get(tenantId);
    if (!tenantConnections || tenantConnections.size === 0) {
      console.log(`[SSE] No connections for tenant ${tenantId}, skipping event ${eventType}`);
      return;
    }

    const event = {
      id: Date.now(),
      type: eventType,
      data: {
        ...data,
        timestamp: new Date().toISOString(),
      },
    };

    // Store in history for reconnection
    if (!this.eventHistory.has(tenantId)) {
      this.eventHistory.set(tenantId, []);
    }
    const history = this.eventHistory.get(tenantId);
    history.push(event);
    if (history.length > this.maxHistorySize) {
      history.shift(); // Remove oldest event
    }

    // Send to all connections
    let sentCount = 0;
    tenantConnections.forEach(connection => {
      this.sendToConnection(connection, event);
      sentCount++;
    });

    console.log(`[SSE] Emitted ${eventType} to ${sentCount} connection(s) for tenant ${tenantId}`);
  }

  /**
   * Emit event to specific users within a tenant
   */
  emitToUsers(tenantId, userIds, eventType, data) {
    const tenantConnections = this.connections.get(tenantId);
    if (!tenantConnections || tenantConnections.size === 0) return;

    const event = {
      id: Date.now(),
      type: eventType,
      data: {
        ...data,
        timestamp: new Date().toISOString(),
      },
    };

    const userIdSet = new Set(userIds);
    let sentCount = 0;

    tenantConnections.forEach(connection => {
      if (userIdSet.has(connection.userId)) {
        this.sendToConnection(connection, event);
        sentCount++;
      }
    });

    console.log(`[SSE] Emitted ${eventType} to ${sentCount} specific user(s) in tenant ${tenantId}`);
  }

  /**
   * Get total number of active connections
   */
  getTotalConnections() {
    let total = 0;
    this.connections.forEach(connections => {
      total += connections.size;
    });
    return total;
  }

  /**
   * Get connections for a specific tenant
   */
  getTenantConnectionCount(tenantId) {
    const tenantConnections = this.connections.get(tenantId);
    return tenantConnections ? tenantConnections.size : 0;
  }

  /**
   * Send heartbeat to all connections (keep-alive)
   */
  sendHeartbeat() {
    this.connections.forEach((tenantConnections, tenantId) => {
      tenantConnections.forEach(connection => {
        try {
          connection.res.write(': heartbeat\n\n');
        } catch (error) {
          console.error(`[SSE] Heartbeat failed for tenant ${tenantId}:`, error.message);
          this.removeConnection(tenantId, connection);
        }
      });
    });
  }
}

// Singleton instance
const sseEmitter = new SSEEventEmitter();

// Send heartbeat every 30 seconds to keep connections alive
setInterval(() => {
  sseEmitter.sendHeartbeat();
}, 30000);

// Event type constants
const EventTypes = {
  JOB_CREATED: 'job:created',
  JOB_UPDATED: 'job:updated',
  JOB_STATUS_CHANGED: 'job:status_changed',
  JOB_DELETED: 'job:deleted',

  SCHEDULE_CREATED: 'schedule:created',
  SCHEDULE_UPDATED: 'schedule:updated',
  SCHEDULE_DELETED: 'schedule:deleted',
  SCHEDULE_CONFIRMED: 'schedule:confirmed',

  WORKER_LOCATION_UPDATED: 'worker:location_updated',
  WORKER_STATUS_CHANGED: 'worker:status_changed',

  TIME_ENTRY_CLOCKED_IN: 'time_entry:clocked_in',
  TIME_ENTRY_CLOCKED_OUT: 'time_entry:clocked_out',
  TIME_ENTRY_SUBMITTED: 'time_entry:submitted',
  TIME_ENTRY_APPROVED: 'time_entry:approved',
};

module.exports = {
  sseEmitter,
  EventTypes,
};
