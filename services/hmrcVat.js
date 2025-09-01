const API_KEY = process.env.HMRC_VAT_API_KEY;

function headers() {
  const base = { Accept: 'application/vnd.hmrc.1.0+json' };
  if (API_KEY) base.Authorization = `Bearer ${API_KEY}`;
  return base;
}

async function checkVat(vrn) {
  const url = `https://api.service.hmrc.gov.uk/organisations/vat/check-vat-number/lookup/${vrn}`;
  try {
    const res = await fetch(url, { headers: headers() });
    if (res.status === 404) return { vrn, valid: false };
    if (res.status === 429) return { vrn, valid: false, error: 'rate_limited' };
    if (!res.ok) return { vrn, valid: false, error: 'upstream_error', status: res.status };
    const data = await res.json();
    return {
      vrn,
      valid: true,
      name: data.organisationName,
      address: data.registeredOfficeAddress,
    };
  } catch (err) {
    console.warn('HMRC VAT fetch error', err.message);
    return { vrn, valid: false, error: 'network_error' };
  }
}

module.exports = { checkVat };
