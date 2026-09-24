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
