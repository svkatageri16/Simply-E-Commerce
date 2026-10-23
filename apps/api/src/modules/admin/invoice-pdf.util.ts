// apps/api/src/modules/admin/invoice-pdf.util.ts

export interface InvoicePdfData {
  invoiceNumber: string;
  status: string;
  tenantName: string;
  tenantSlug: string;
  ownerName: string;
  ownerPhone?: string | null;
  ownerEmail?: string | null;
  merchantGstin?: string | null;
  billingAddress?: string | null;
  billingState?: string | null;
  issuerName?: string;
  issuerGstin?: string;
  issuerAddress?: string;
  issuerWebsite?: string;
  invoiceDate: string;
  billingPeriod: string;
  billingPeriodShort: string;
  currency: string;
  paymentMethod: string;
  paymentReference?: string | null;
  paidAtDate?: string | null;
  paymentStatus: string;
  planName: string;
  formattedAmount: string;
  formattedBaseAmount?: string;
  formattedTaxAmount?: string;
  gstRate?: number;
}

function escapePdfText(str?: string | null): string {
  if (!str) return '';
  return str.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/**
 * Generates an official, standards-compliant PDF 1.4 vector document for a subscription invoice.
 * No external rendering dependencies, zero native binaries, perfectly reproducible.
 */
export function generateInvoicePdfBuffer(data: InvoicePdfData): Buffer {
  let s = '';

  // Top primary header banner
  s += '0.08 0.12 0.22 rg\n'; // Sleek dark navy
  s += '0 825 595.28 17 re f\n';

  // Brand Header
  s += 'BT\n/F2 20 Tf\n40 780 Td\n(LetzShop) Tj\nET\n';
  s += `BT\n/F1 8.5 Tf\n40 766 Td\n(${escapePdfText(data.issuerName || 'AIKYAM AI SYSTEMS PRIVATE LIMITED')} - Platform Issuer) Tj\nET\n`;
  s += `BT\n/F1 8 Tf\n40 754 Td\n(GSTIN: ${escapePdfText(data.issuerGstin || 'Not configured')} | ${escapePdfText(data.issuerAddress || 'Not configured')}) Tj\nET\n`;

  // Invoice Title
  s += 'BT\n/F2 16 Tf\n380 780 Td\n(TAX INVOICE) Tj\nET\n';
  s += `BT\n/F2 9 Tf\n380 765 Td\n(Status: ${escapePdfText(data.status)}) Tj\nET\n`;

  // Divider line
  s += '0.85 0.85 0.85 RG\n1 w\n';
  s += '40 740 m 555 740 l S\n';

  // Billed To (Left Column)
  s += 'BT\n/F2 10 Tf\n40 720 Td\n(BILLED TO:) Tj\nET\n';
  s += `BT\n/F2 11 Tf\n40 705 Td\n(${escapePdfText(data.tenantName)}) Tj\nET\n`;
  if (data.merchantGstin) {
    s += `BT\n/F2 9 Tf\n40 691 Td\n(GSTIN: ${escapePdfText(data.merchantGstin)}) Tj\nET\n`;
  }
  s += `BT\n/F1 8.5 Tf\n40 ${data.merchantGstin ? 678 : 691} Td\n(Store Slug: ${escapePdfText(data.tenantSlug)}${data.billingState ? ` | Place of Supply: ${escapePdfText(data.billingState)}` : ''}) Tj\nET\n`;
  s += `BT\n/F1 8.5 Tf\n40 ${data.merchantGstin ? 665 : 678} Td\n(Contact: ${escapePdfText(data.ownerName)} | Phone: ${escapePdfText(data.ownerPhone || 'Not provided')}) Tj\nET\n`;
  if (data.billingAddress) {
    s += `BT\n/F1 8 Tf\n40 ${data.merchantGstin ? 652 : 665} Td\n(Billing Address: ${escapePdfText(data.billingAddress)}) Tj\nET\n`;
  }

  // Invoice Details (Right Column)
  s += 'BT\n/F2 10 Tf\n360 720 Td\n(INVOICE DETAILS:) Tj\nET\n';
  s += `BT\n/F1 9 Tf\n360 705 Td\n(Invoice Number: ${escapePdfText(data.invoiceNumber)}) Tj\nET\n`;
  s += `BT\n/F1 9 Tf\n360 691 Td\n(Invoice Date: ${escapePdfText(data.invoiceDate)}) Tj\nET\n`;
  s += `BT\n/F1 9 Tf\n360 678 Td\n(Billing Period: ${escapePdfText(data.billingPeriod)}) Tj\nET\n`;
  s += `BT\n/F1 9 Tf\n360 665 Td\n(Currency: ${escapePdfText(data.currency)} | Method: ${escapePdfText(data.paymentMethod)}) Tj\nET\n`;

  // Items Table Header
  const tableY = 620;
  s += '0.94 0.95 0.97 rg\n';
  s += `40 ${tableY - 18} 515 22 re f\n`;
  s += '0.8 0.82 0.85 RG\n';
  s += `40 ${tableY - 18} 515 22 re S\n`;

  s += `BT\n/F2 9 Tf\n50 ${tableY - 12} Td\n(DESCRIPTION) Tj\nET\n`;
  s += `BT\n/F2 9 Tf\n310 ${tableY - 12} Td\n(PERIOD) Tj\nET\n`;
  s += `BT\n/F2 9 Tf\n430 ${tableY - 12} Td\n(RATE) Tj\nET\n`;
  s += `BT\n/F2 9 Tf\n495 ${tableY - 12} Td\n(AMOUNT) Tj\nET\n`;

  // Table Row 1
  const row1Y = tableY - 40;
  s += `BT\n/F2 9 Tf\n50 ${row1Y} Td\n(${escapePdfText(data.planName + ' Plan Subscription')}) Tj\nET\n`;
  s += `BT\n/F1 8 Tf\n50 ${row1Y - 12} Td\n(LetzShop SaaS platform license & merchant storefront) Tj\nET\n`;
  s += `BT\n/F1 9 Tf\n310 ${row1Y} Td\n(${escapePdfText(data.billingPeriodShort)}) Tj\nET\n`;
  s += `BT\n/F1 9 Tf\n430 ${row1Y} Td\n(${escapePdfText(data.formattedAmount)}) Tj\nET\n`;
  s += `BT\n/F2 9 Tf\n495 ${row1Y} Td\n(${escapePdfText(data.formattedAmount)}) Tj\nET\n`;

  // Table bottom border
  s += '0.85 0.85 0.85 RG\n';
  s += `40 ${row1Y - 22} m 555 ${row1Y - 22} l S\n`;

  // Totals Box
  const totalsY = row1Y - 45;
  s += `BT\n/F1 9 Tf\n370 ${totalsY} Td\n(Subtotal:) Tj\nET\n`;
  s += `BT\n/F1 9 Tf\n495 ${totalsY} Td\n(${escapePdfText(data.formattedBaseAmount || data.formattedAmount)}) Tj\nET\n`;

  s += `BT\n/F1 9 Tf\n370 ${totalsY - 16} Td\n(GST / Tax:) Tj\nET\n`;
  s += `BT\n/F1 9 Tf\n495 ${totalsY - 16} Td\n(${escapePdfText(data.formattedTaxAmount || "Not recorded")}) Tj\nET\n`;

  s += `BT\n/F1 8 Tf\n370 ${totalsY - 28} Td\n(${data.gstRate !== undefined ? "GST " + data.gstRate + "%" : "Legacy tax breakdown unavailable"}) Tj\nET\n`;

  s += '0.85 0.85 0.85 RG\n';
  s += `360 ${totalsY - 35} m 555 ${totalsY - 35} l S\n`;

  // Total Paid Banner Box
  s += '0.94 0.97 0.95 rg\n';
  s += `360 ${totalsY - 65} 195 26 re f\n`;
  s += '0.7 0.85 0.7 RG\n';
  s += `360 ${totalsY - 65} 195 26 re S\n`;

  s += `BT\n/F2 11 Tf\n370 ${totalsY - 56} Td\n(TOTAL PAID:) Tj\nET\n`;
  s += `BT\n/F2 11 Tf\n490 ${totalsY - 56} Td\n(${escapePdfText(data.formattedAmount)}) Tj\nET\n`;

  // Payment Details Box
  const payBoxY = totalsY - 120;
  s += '0.97 0.98 0.99 rg\n';
  s += `40 ${payBoxY} 515 45 re f\n`;
  s += '0.88 0.9 0.92 RG\n';
  s += `40 ${payBoxY} 515 45 re S\n`;

  s += `BT\n/F2 9 Tf\n50 ${payBoxY + 30} Td\n(PAYMENT TRANSACTION DETAILS) Tj\nET\n`;
  s += `BT\n/F1 8 Tf\n50 ${payBoxY + 16} Td\n(Gateway: ${escapePdfText(data.paymentMethod)} | Ref: ${escapePdfText(data.paymentReference || 'N/A')}) Tj\nET\n`;
  s += `BT\n/F1 8 Tf\n50 ${payBoxY + 4} Td\n(Paid At: ${escapePdfText(data.paidAtDate || 'N/A')} | Status: ${escapePdfText(data.paymentStatus)}) Tj\nET\n`;

  // Legal Footer
  s += '0.85 0.85 0.85 RG\n';
  s += '40 70 m 555 70 l S\n';
  s += 'BT\n/F1 8 Tf\n40 55 Td\n(This is a computer-generated invoice and requires no physical signature.) Tj\nET\n';
  s += 'BT\n/F1 8 Tf\n40 43 Td\n(LetzShop SaaS E-Commerce Platform · AIKYAM AI Systems · support@letzshop.store) Tj\nET\n';

  // Build PDF structure
  const contentStream = s;
  const streamLen = Buffer.byteLength(contentStream, 'utf8');

  const obj1 = '<< /Type /Catalog /Pages 2 0 R >>';
  const obj2 = '<< /Type /Pages /Kids [3 0 R] /Count 1 >>';
  const obj3 =
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>';
  const obj4 = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  const obj5 = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>';
  const obj6 = `<< /Length ${streamLen} >>\nstream\n${contentStream}\nendstream`;

  const allObjs = [obj1, obj2, obj3, obj4, obj5, obj6];

  let body = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets: number[] = [0];

  for (let i = 0; i < allObjs.length; i++) {
    offsets.push(Buffer.byteLength(body, 'utf8'));
    body += `${i + 1} 0 obj\n${allObjs[i]}\nendobj\n`;
  }

  const startXref = Buffer.byteLength(body, 'utf8');
  body += `xref\n0 ${allObjs.length + 1}\n`;
  body += '0000000000 65535 f \n';
  for (let i = 1; i <= allObjs.length; i++) {
    body += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${allObjs.length + 1} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF`;

  return Buffer.from(body, 'utf8');
}
