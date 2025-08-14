const { Prisma } = require('./prisma.cjs');

function safeNum(v) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function computeTotals(variation, lines = []) {
  const lineCost = lines.reduce(
    (a, l) => a + safeNum(l.qty) * safeNum(l.unit_cost),
    0,
  );
  const lineSell = lines.reduce(
    (a, l) => a + safeNum(l.qty) * safeNum(l.unit_sell),
    0,
  );

  const useFallback = !lines.length;
  const cost = useFallback ? safeNum(variation?.estimated_cost) : lineCost;
  const sell = useFallback ? safeNum(variation?.estimated_sell) : lineSell;

  const margin = sell - cost;
  const marginPct = sell ? margin / sell : 0;

  return {
    costTotal: new Prisma.Decimal(cost.toFixed(2)),
    sellTotal: new Prisma.Decimal(sell.toFixed(2)),
    margin: new Prisma.Decimal(margin.toFixed(2)),
    marginPct,
  };
}

module.exports = { computeTotals };
