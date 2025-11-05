const net = require('net');

/**
 * Send a plain-text email using raw SMTP
 * @param {Object} options
 * @param {string} options.to - Recipient email address
 * @param {string} options.subject - Email subject
 * @param {string} options.text - Email body (plain text)
 * @param {string} [options.from] - Sender email (defaults to SMTP_FROM env var)
 * @returns {Promise<void>}
 */
async function sendEmail({ to, subject, text, from }) {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT) || 25;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const fromAddress = from || process.env.SMTP_FROM || 'noreply@example.com';

  // If SMTP_HOST is not configured, log warning and skip sending
  if (!host) {
    console.warn('[email] SMTP_HOST not configured, skipping email send:', { to, subject });
    return;
  }

  return new Promise((resolve, reject) => {
    const client = net.createConnection({ host, port }, () => {
      console.log(`[email] Connected to SMTP server ${host}:${port}`);
    });

    let buffer = '';
    const commands = [];
    let commandIndex = 0;
    let greetingReceived = false;
    let emailSent = false; // Track if email was successfully queued

    client.on('data', (data) => {
      buffer += data.toString();
      const lines = buffer.split('\r\n');

      // Process complete lines
      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i];
        console.log(`[email] S: ${line}`);

        const code = parseInt(line.substring(0, 3));
        const isFinalLine = line.charAt(3) === ' '; // Space means final line, dash means more lines coming

        // Handle initial server greeting (220)
        if (!greetingReceived && code === 220 && isFinalLine) {
          greetingReceived = true;

          // Now build SMTP command sequence after receiving greeting
          commands.push({ type: 'command', data: 'EHLO localhost\r\n' });

          // Add AUTH LOGIN if credentials are provided
          if (user && pass) {
            commands.push({ type: 'command', data: 'AUTH LOGIN\r\n' });
            commands.push({ type: 'auth_username', data: Buffer.from(user).toString('base64') + '\r\n' });
            commands.push({ type: 'auth_password', data: Buffer.from(pass).toString('base64') + '\r\n' });
          }

          commands.push({ type: 'command', data: `MAIL FROM:<${fromAddress}>\r\n` });
          commands.push({ type: 'command', data: `RCPT TO:<${to}>\r\n` });
          commands.push({ type: 'command', data: 'DATA\r\n' });

          // Build email message (this is sent after 354 response to DATA)
          const message = [
            `Subject: ${subject}`,
            `From: ${fromAddress}`,
            `To: ${to}`,
            'Content-Type: text/plain; charset=UTF-8',
            '',
            text,
            '.',
            ''
          ].join('\r\n');

          commands.push({ type: 'data_body', data: message + '\r\n' });
          commands.push({ type: 'command', data: 'QUIT\r\n' });

          // Send EHLO
          const cmd = commands[commandIndex++];
          console.log(`[email] C: ${cmd.data.trim()}`);
          client.write(cmd.data);
          continue;
        }

        // Handle DATA response (354 = ready for message body)
        if (code === 354 && isFinalLine) {
          if (commandIndex < commands.length) {
            const cmd = commands[commandIndex++];
            if (cmd.type === 'data_body') {
              console.log(`[email] C: ${cmd.data.substring(0, 50).trim()}${cmd.data.length > 50 ? '...' : ''}`);
              client.write(cmd.data);
            }
          }
          continue;
        }

        // Handle AUTH LOGIN responses (334 = expecting username/password)
        if (code === 334) {
          if (commandIndex < commands.length) {
            const cmd = commands[commandIndex++];
            console.log(`[email] C: ${cmd.data.trim()}`);
            client.write(cmd.data);
          }
          continue;
        }

        // Check for error codes
        if (code >= 400 && code < 600 && isFinalLine) {
          // If email was already sent (250 response to DATA), ignore QUIT errors
          if (emailSent) {
            console.warn(`[email] Ignoring error after email sent: ${line}`);
            client.end();
            return resolve(); // Email was sent, treat as success
          }
          client.end();
          return reject(new Error(`SMTP error: ${line}`));
        }

        // On positive response (and final line of multi-line response), send next command
        if (code >= 200 && code < 400 && isFinalLine) {
          // If we just got 250 response and the last command was data_body, email is sent
          if (code === 250 && commandIndex > 0 && commands[commandIndex - 1]?.type === 'data_body') {
            emailSent = true;
            console.log('[email] Email successfully queued');
          }

          if (commandIndex < commands.length) {
            const cmd = commands[commandIndex++];
            console.log(`[email] C: ${cmd.data.substring(0, 50).trim()}${cmd.data.length > 50 ? '...' : ''}`);
            client.write(cmd.data);
          } else {
            // All commands sent successfully
            client.end();
          }
        }
      }

      // Keep the last incomplete line in the buffer
      buffer = lines[lines.length - 1];
    });

    client.on('end', () => {
      console.log('[email] SMTP connection closed');
      resolve();
    });

    client.on('error', (err) => {
      console.error('[email] SMTP connection error:', err.message);
      reject(err);
    });

    client.on('timeout', () => {
      client.end();
      reject(new Error('SMTP connection timeout'));
    });

    client.setTimeout(10000); // 10 second timeout
  });
}

module.exports = { sendEmail };
