import type { VerificationRecord } from '@/lib/verification-types';
import { resultExplanation, resultLabels, verificationTime } from '@/lib/verification-types';

export function ResultBadge({ result }: { result: VerificationRecord['result'] }) {
  return <span className={`status-badge result-${result}`}>{resultLabels[result]}</span>;
}

export function VerificationDetails({ record }: { record: VerificationRecord }) {
  const product = record.product;
  return <div className="verification-details">
    <p>{resultExplanation(record)}</p>
    {product && <>
      <h3>{product.name}</h3>
      <dl className="service-list">
        {[
          ['Category', product.category === 'seed' ? 'Seed' : 'Fertilizer'], ['Manufacturer', product.manufacturer],
          ['Product code', product.codeValue], ['Batch', product.batchNumber],
          ['Manufactured', product.manufactureDate ?? 'Not provided'], ['Expires', product.expiryDate],
          ['Product status', product.productStatus], ['Code status', product.codeStatus],
          ...(product.registrationNo ? [['Registration reference', product.registrationNo]] : []),
        ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl>
      {product.description && <p className="product-description">{product.description}</p>}
    </>}
    <p className="field-hint">Checked {verificationTime(record.verifiedAt)} (East Africa Time). Reference #{record.id}.</p>
    <p className="record-note">A code match checks stored records and cannot confirm the physical contents of a package. Compare these details with the label.</p>
  </div>;
}
