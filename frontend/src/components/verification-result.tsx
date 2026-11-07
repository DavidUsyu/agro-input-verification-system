import type { VerificationRecord } from '@/lib/verification-types';
import { resultExplanation, resultLabels, verificationTime } from '@/lib/verification-types';

export function ResultBadge({ result }: { result: VerificationRecord['result'] }) {
  return <span className={`status-badge result-${result}`}>{resultLabels[result]}</span>;
}

export function VerificationDetails({ record, administrator = false }: { record: VerificationRecord; administrator?: boolean }) {
  const product = record.product;
  return <div className={`verification-details${administrator ? ' admin-verification-details' : ''}`}>
    <div className={administrator ? 'verification-assessment-grid' : undefined}><section className={administrator ? 'verification-public-summary' : undefined}>{administrator && <><p className="eyebrow">Public verification result</p><h3>{resultLabels[record.result]}</h3></>}<p>{resultExplanation(record)}</p>{administrator && <p className="field-hint">This is the result returned to the person checking the code. Internal assessment details stay in the administrator workspace.</p>}</section>
    {administrator && record.locationStatus && <section className="private-verification-details" aria-label="Administrator verification details"><p className="eyebrow">Administrator only</p><h3>Location &amp; internal assessment</h3><dl className="service-list">
      <div><dt>Distribution county at check</dt><dd>{record.distributionCounty ?? 'Not assigned'}</dd></div>
      <div><dt>Recorded county</dt><dd>{record.county ?? 'Not resolved'}</dd></div>
      <div><dt>Location source</dt><dd>{record.locationSource === 'legacy' ? 'Legacy record (profile county, not current location)' : record.locationSource === 'device_reported' ? 'Device-reported measurement' : record.locationSource === 'self_reported' ? 'Self-reported county (USSD, not device-confirmed)' : 'Unavailable'}</dd></div>
      <div><dt>Location assessment</dt><dd>{record.locationStatus.replaceAll('_', ' ')}</dd></div>
      <div><dt>Internal outcome reason</dt><dd>{record.reason.replaceAll('_', ' ')}</dd></div>
    </dl>{record.locationSource === 'self_reported' && <p className="field-hint">The county was chosen by the farmer. It was not confirmed by a device location measurement.</p>}</section>}</div>
    {product && <>
      {administrator && <p className="eyebrow">Saved product details at the time of the check</p>}<h3>{product.name}</h3>
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
