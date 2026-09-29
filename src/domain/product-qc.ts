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

export interface MeasurementCriterion {
  target: string | number;
  minusTolerance: string | number;
  plusTolerance: string | number;
}

export interface MeasurementStandard {
  values: MeasurementCriterion[];
  visualResult?: string;
}

export type MeasurementCheckStatus = "pass" | "fail" | "pending" | "not-configured";

export interface MeasurementAssessment {
  status: Exclude<MeasurementCheckStatus, "not-configured">;
  cells: MeasurementCheckStatus[];
  visual: MeasurementCheckStatus;
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
  measurementStandard?: MeasurementStandard;
  measurements: MeasurementRow[];
}

export function createEmptyMeasurementStandard(columnCount = 7): MeasurementStandard {
  return {
    values: Array.from({ length: columnCount }, () => ({ target: "", minusTolerance: "", plusTolerance: "" })),
    visualResult: "",
  };
}

function hasMeasurementValue(value: string | number | undefined): boolean {
  return String(value ?? "").trim() !== "";
}

function measurementNumber(value: string | number | undefined): number | undefined {
  if (!hasMeasurementValue(value)) return undefined;
  const normalized = String(value).trim().replace(/\s+/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function evaluateMeasurementCell(value: string | number | undefined, criterion: MeasurementCriterion | undefined): MeasurementCheckStatus {
  if (!criterion || ![criterion.target, criterion.minusTolerance, criterion.plusTolerance].some(hasMeasurementValue)) return "not-configured";
  const target = measurementNumber(criterion.target);
  const minus = measurementNumber(criterion.minusTolerance);
  const plus = measurementNumber(criterion.plusTolerance);
  if (target === undefined || (minus === undefined && plus === undefined)) return "pending";
  const measured = measurementNumber(value);
  if (measured === undefined) return "pending";
  const lowerTolerance = Math.abs(minus ?? plus ?? 0);
  const upperTolerance = Math.abs(plus ?? minus ?? 0);
  return measured >= target - lowerTolerance && measured <= target + upperTolerance ? "pass" : "fail";
}

export function evaluateMeasurementRow(row: MeasurementRow, standard?: MeasurementStandard): MeasurementAssessment {
  const cells = Array.from({ length: 7 }, (_, index) => evaluateMeasurementCell(row.values[index], standard?.values[index]));
  const expectedVisual = String(standard?.visualResult ?? "").trim().toUpperCase();
  const actualVisual = String(row.visualResult ?? "").trim().toUpperCase();
  const visual: MeasurementCheckStatus = expectedVisual
    ? actualVisual ? (actualVisual === expectedVisual ? "pass" : "fail") : "pending"
    : "not-configured";
  const configuredChecks = [...cells, visual].filter((status) => status !== "not-configured");
  const status = configuredChecks.some((check) => check === "fail")
    ? "fail"
    : configuredChecks.length === 0 || configuredChecks.some((check) => check === "pending")
      ? "pending"
      : "pass";
  return { status, cells, visual };
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
export function createUniqueQcRecordId(reservedIds: Iterable<string> = []): string {
  const reserved = new Set(Array.from(reservedIds, (value) => String(value).trim().toUpperCase()).filter(Boolean));
  let timestamp = Date.now();
  let candidate = "";
  do {
    candidate = `QC-${timestamp}-${randomDigits(6)}`;
    if (issuedQcRecordIds.has(candidate) || reserved.has(candidate)) timestamp += 1;
  } while (issuedQcRecordIds.has(candidate) || reserved.has(candidate));
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
