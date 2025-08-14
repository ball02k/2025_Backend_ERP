const { Prisma } = require('./prisma.cjs');

function computeTotals(variation, lines = []) {
  const hasLines = Array.isArray(lines) && lines.length > 0;
  let cost = 0;
  let sell = 0;
  if (hasLines) {
    for (const l of lines) {
      const qty = Number(l.qty ?? 0);
      const unitCost = Number(l.unit_cost ?? l.unitCost ?? 0);
      const unitSell = Number(l.unit_sell ?? l.unitSell ?? 0);
      cost += qty * unitCost;
      sell += qty * unitSell;
    }
  } else {
    cost = Number(variation?.estimated_cost ?? 0);
    sell = Number(variation?.estimated_sell ?? 0);
  }
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
