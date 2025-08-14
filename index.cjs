const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { PrismaClient } = require('@prisma/client');

const app = express();
const prisma = new PrismaClient();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '5mb' }));
app.use(morgan('dev'));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/reference', require('./routes/reference')(prisma));
app.use('/api/clients', require('./routes/clients')(prisma));

app.use('/api/contacts', require('./routes/contacts')(prisma));


app.use('/api/projects', require('./routes/projects')(prisma));
app.use('/api/tasks', require('./routes/tasks')(prisma));

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

module.exports = app;
