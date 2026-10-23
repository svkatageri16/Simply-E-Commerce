/** Server-owned subscription quote; plan.pricePaise remains the pretax base. */
export function subscriptionPrice(baseAmountPaise: number, configuredRate = process.env.SUBSCRIPTION_GST_RATE ?? '18') {
  const rate = Number(configuredRate);
  if (!Number.isSafeInteger(baseAmountPaise) || baseAmountPaise < 0 || !Number.isFinite(rate) || rate < 0 || rate > 100 || !Number.isInteger(rate * 100))
    throw new Error('Invalid subscription base amount or SUBSCRIPTION_GST_RATE.');
  const gstBasisPoints = Math.round(rate * 100);
  const taxPaise = Math.round(baseAmountPaise * gstBasisPoints / 10000);
  return { baseAmountPaise, gstBasisPoints, gstRate: rate, taxPaise, totalPaise: baseAmountPaise + taxPaise };
}
