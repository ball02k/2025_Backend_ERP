class StubOcr {
  async extractInvoiceFields() {
    return {
      provider: 'stub',
      fields: {
        invoiceNumber: `INV-${Date.now()}`,
        issueDate: new Date().toISOString(),
        dueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(),
        subtotal: 1000,
        vatTotal: 200,
        grandTotal: 1200,
        currency: 'GBP',
        poNumberRef: 'PO-2025-0001',
        supplierName: 'Demo Supplier',
      },
    };
  }
}

module.exports = { StubOcr };

