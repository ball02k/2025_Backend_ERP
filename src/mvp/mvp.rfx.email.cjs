const router = require('express').Router({ mergeParams: true });
const net = require('net');

router.post('/mvp/rfx/:rfxId/send', async (req, res) => {
  const { to, subject, body } = req.body || {};
  const host = process.env.SMTP_HOST; const from = process.env.SMTP_FROM || 'noreply@example.com';
  if (!host) return res.json({ queued: true, note: 'SMTP not configured' });
  await new Promise((resolve, reject) => {
    const s = net.createConnection({ host, port: 25 }, () => {
      const cmds = [`HELO localhost\r\n`, `MAIL FROM:<${from}>\r\n`, `RCPT TO:<${to}>\r\n`, `DATA\r\n`, `Subject: ${subject}\r\nFrom: ${from}\r\nTo: ${to}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${body}\r\n.\r\n`, `QUIT\r\n`];
      let i = 0; s.on('data', () => { if (i < cmds.length) s.write(cmds[i++]); else { s.end(); resolve(); } });
    });
    s.on('error', reject);
  });
  res.json({ ok: true });
});

module.exports = router;

