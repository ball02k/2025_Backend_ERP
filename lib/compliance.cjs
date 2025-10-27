async function checkContractIssuable({ tenantId, contractId }) {
  return {
    compliant: true,
    issues: []
  };
}

module.exports = { checkContractIssuable };
