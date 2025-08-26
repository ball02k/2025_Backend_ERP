#!/usr/bin/env node
/* eslint-disable */
const base = 'http://localhost:3001';

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return res.json();
}

(async () => {
  try {
    const health = await fetchJson(`${base}/api/health`);
    if (!health.ok) throw new Error('health not ok');

    const login = await fetchJson(`${base}/api/dev/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'demo@erp.local', password: 'demo123!' })
    });
    const token = login.token;
    if (!token) throw new Error('no token');

    const headers = { Authorization: `Bearer ${token}` };
    const projects = await fetchJson(`${base}/api/projects`, { headers });
    if (!Array.isArray(projects.rows) || projects.rows.length === 0) {
      throw new Error('no projects');
    }
    const clients = await fetchJson(`${base}/api/clients`, { headers });
    if (!Array.isArray(clients.rows) || clients.rows.length === 0) {
      throw new Error('no clients');
    }
    console.log('smoke ok');
  } catch (e) {
    console.error('smoke failed:', e.message);
    process.exit(1);
  }
})();
