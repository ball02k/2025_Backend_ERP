const API_KEY = process.env.COMPANIES_HOUSE_API_KEY;

function authHeader() {
  if (!API_KEY) return {};
  // Companies House uses basic auth with API key as username
  const token = Buffer.from(API_KEY + ':').toString('base64');
  return { Authorization: `Basic ${token}` };
}

async function fetchCompanyProfile(companyNumber) {
  const url = `https://api.company-information.service.gov.uk/company/${companyNumber}`;
  try {
    const res = await fetch(url, { headers: authHeader() });
    if (res.status === 404) return null;
    if (res.status === 429) return { error: 'rate_limited' };
    if (!res.ok) return { error: 'upstream_error', status: res.status };
    const data = await res.json();
    return {
      name: data.company_name,
      companyNumber: data.company_number,
      registeredAddress: data.registered_office_address,
      incorporationDate: data.date_of_creation,
      status: data.company_status,
    };
  } catch (err) {
    console.warn('CompaniesHouse fetch error', err.message);
    return { error: 'network_error' };
  }
}

module.exports = { fetchCompanyProfile };
