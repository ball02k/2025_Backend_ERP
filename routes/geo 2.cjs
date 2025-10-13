const router = require('express').Router();

// GET /geo/postcode/:pc  -> { postcode, lat, lng, address? }
router.get('/geo/postcode/:pc', async (req, res) => {
  const pcRaw = String(req.params.pc || '');
  const pc = encodeURIComponent(pcRaw.replace(/\s+/g, ''));
  if (!pc) return res.status(400).json({ error: 'postcode required' });
  const rsp = await fetch(`https://api.postcodes.io/postcodes/${pc}`);
  const json = await rsp.json();
  if (json.status !== 200) return res.status(404).json({ error: 'not found' });
  const r = json.result;
  res.json({
    postcode: r.postcode,
    lat: r.latitude,
    lng: r.longitude,
    address: [r.admin_ward, r.admin_district, r.region].filter(Boolean).join(', '),
  });
});

// GET /geo/reverse?lat=&lng=
router.get('/geo/reverse', async (req, res) => {
  const lat = req.query.lat;
  const lng = req.query.lng;
  if (!lat || !lng) return res.status(400).json({ error: 'lat,lng required' });
  const rsp = await fetch(
    `https://api.postcodes.io/postcodes?lon=${encodeURIComponent(String(lng))}&lat=${encodeURIComponent(String(lat))}`
  );
  const json = await rsp.json();
  const r = json?.result?.[0];
  if (!r) return res.status(404).json({ error: 'not found' });
  res.json({ postcode: r.postcode, lat: r.latitude, lng: r.longitude });
});

module.exports = router;

