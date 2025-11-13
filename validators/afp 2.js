function validateCreateAfp(body) {
  const required = [
    "projectId","applicationDate","periodStart","periodEnd",
    "grossToDate","variationsValue","prelimsValue","retentionValue",
    "mosValue","offsiteValue","deductionsValue","netClaimed"
  ];
  for (const k of required) if (body[k] === undefined || body[k] === null) throw new Error(`Missing field: ${k}`);
}

function validateNoticePayload(body) {
  if (body.type === "pay_less" && (!body.reason || !String(body.reason).trim())) {
    throw new Error("Pay Less Notice requires a reason.");
  }
}

module.exports = { validateCreateAfp, validateNoticePayload };

