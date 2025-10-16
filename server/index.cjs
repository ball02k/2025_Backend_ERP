const express = require('express');
const cors = require('cors');
const app = express();

if (typeof BigInt.prototype.toJSON !== 'function') {
  // Ensure BigInt serializes safely in JSON responses
  // eslint-disable-next-line no-extend-native
  BigInt.prototype.toJSON = function toJSON() {
    return Number(this);
  };
}

app.use(express.json());
app.use(cors());

const { authMiddleware } = require('./middleware/auth.cjs');

app.use(authMiddleware);

app.use('/packages', require('./routes/packages.cjs'));
app.use('/contracts', require('./routes/contracts.cjs'));

module.exports = app;

if (require.main === module) {
  const port = process.env.SERVER_PORT ? Number(process.env.SERVER_PORT) : 4000;
  app.listen(port, () => {
    console.log(`[server] listening on port ${port}`);
  });
}
