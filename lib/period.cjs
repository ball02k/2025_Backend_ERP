// period "YYYY-MM" helpers (TZ: Europe/London)
function parsePeriod(period) {
  const [y, m] = period.split('-').map(Number); // m = 1..12
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999)); // last ms of month
  return { y, m, start, end };
}
module.exports = { parsePeriod };
