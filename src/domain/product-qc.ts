export interface Product {
  project: string;
  po: string;
  partNo: string;
  lotNo?: string;
  supplier?: string;
  quantity: number;
  unit: string;
  slipNo: string;
  receivedDate: string;
  productName?: string;
}

export interface MeasurementRow {
  no: number;
  values: Array<string | number>;
  visualResult?: string;
}

export interface ProductQc {
  product: Product;
  recordId: string;
  inspectionDate: string;
  inspector: string;
  inspectionLevel?: string;
  defectQuantity?: number;
  defectContent?: string;
  responseDueDate?: string;
  measurements: MeasurementRow[];
}

const issuedQcRecordIds = new Set<string>();

function randomDigits(length: number): string {
  const max = 10 ** length;
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.getRandomValues) {
    const values = new Uint32Array(1);
    cryptoApi.getRandomValues(values);
    return String(values[0] % max).padStart(length, "0");
  }
  return String(Math.floor(Math.random() * max)).padStart(length, "0");
}

/**
 * Creates a human-readable QC record id with millisecond timestamp and
 * numeric entropy. The in-memory collision guard also protects records
 * generated during the same millisecond in one app session.
 */
export function createUniqueQcRecordId(): string {
  let timestamp = Date.now();
  let candidate = "";
  do {
    candidate = `QC-${timestamp}-${randomDigits(6)}`;
    if (issuedQcRecordIds.has(candidate)) timestamp += 1;
  } while (issuedQcRecordIds.has(candidate));
  issuedQcRecordIds.add(candidate);
  return candidate;
}

export function productKey(product: Product, inspectionNo = "1"): string {
  return [
    product.project,
    product.po,
    product.partNo,
    product.lotNo ?? "N/A",
    product.slipNo,
    inspectionNo,
  ].join("|");
}
