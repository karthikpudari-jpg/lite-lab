import { useMemo, useState } from 'react';
import api from '../../api/client';

function isOutOfRange(value, low, high) {
  const v = Number(value);
  if (value === '' || Number.isNaN(v) || low == null || high == null) return false;
  const l = Number(low);
  const h = Number(high);
  if (Number.isNaN(l) || Number.isNaN(h)) return false;
  return v < l || v > h;
}

function paramsFor(sample) {
  return sample.BillItem?.TestMaster?.ParameterMasters || [];
}

function initialValuesFor(sample) {
  const values = {};
  for (const r of sample.Results || []) values[r.parameterId] = r.value;
  return values;
}

/**
 * Full-screen result entry + review/verify panel for one bill's tests -
 * the same screen opens whichever of "Results" or "Verify" was clicked on a
 * test, since both are really "look at this test's values and confirm them".
 */
export default function ReviewResults({ group, focusSampleId, onClose, onSaved }) {
  const eligibleSamples = useMemo(
    () => group.samples.filter((s) => ['COLLECTED', 'RESULT_ENTERED', 'VERIFIED'].includes(s.status)),
    [group],
  );

  const [values, setValues] = useState(() => {
    const v = {};
    for (const s of eligibleSamples) v[s.id] = initialValuesFor(s);
    return v;
  });
  const [savedValues] = useState(() => {
    const v = {};
    for (const s of eligibleSamples) v[s.id] = initialValuesFor(s);
    return v;
  });
  const [checked, setChecked] = useState(() => {
    const set = new Set();
    for (const s of eligibleSamples) {
      const complete = paramsFor(s).every((p) => (initialValuesFor(s)[p.id] || '').toString().trim() !== '');
      if (complete) set.add(s.id);
    }
    return set;
  });
  const [activeSampleId, setActiveSampleId] = useState(
    focusSampleId && eligibleSamples.some((s) => s.id === focusSampleId) ? focusSampleId : eligibleSamples[0]?.id,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const activeSample = eligibleSamples.find((s) => s.id === activeSampleId);

  function enteredCount(sample) {
    const params = paramsFor(sample);
    const vals = values[sample.id] || {};
    const filled = params.filter((p) => (vals[p.id] || '').toString().trim() !== '').length;
    return { filled, total: params.length };
  }

  function setValue(sampleId, parameterId, value) {
    setValues((v) => ({ ...v, [sampleId]: { ...v[sampleId], [parameterId]: value } }));
  }

  function toggleChecked(sampleId) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(sampleId)) next.delete(sampleId); else next.add(sampleId);
      return next;
    });
  }

  function toggleSelectAll() {
    setChecked((prev) => (prev.size === eligibleSamples.length ? new Set() : new Set(eligibleSamples.map((s) => s.id))));
  }

  const checkedSamples = eligibleSamples.filter((s) => checked.has(s.id));
  const allCheckedReady = checkedSamples.length > 0 && checkedSamples.every((s) => enteredCount(s).filled === enteredCount(s).total);

  async function handleSubmit() {
    if (busy || checkedSamples.length === 0) return;
    setBusy(true);
    setError('');
    try {
      for (const s of checkedSamples) {
        const params = paramsFor(s);
        const results = params.map((p) => ({ parameterId: p.id, value: (values[s.id]?.[p.id] || '').toString() }));
        await api.post(`/lab/samples/${s.id}/results`, { results });
      }
      if (allCheckedReady) {
        for (const s of checkedSamples) {
          if (s.status === 'RESULT_ENTERED' || s.status === 'COLLECTED') {
            await api.post(`/lab/samples/${s.id}/verify`).catch(() => {});
          }
        }
      }
      onSaved();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save');
    } finally {
      setBusy(false);
    }
  }

  if (!activeSample) return null;
  const activeCount = enteredCount(activeSample);
  const activeHasChanges = paramsFor(activeSample).some(
    (p) => (values[activeSample.id]?.[p.id] || '') !== (savedValues[activeSample.id]?.[p.id] || ''),
  );

  return (
    <div className="review-screen">
      <div className="review-header">
        <strong>Review Results</strong>
        <span className="dot">•</span>
        <span className="meta">#{`LAB${String(group.billId).padStart(5, '0')}`}</span>
        <span className="dot">•</span>
        <span className="meta">{group.patient?.name}</span>
        <button className="close-btn" onClick={onClose} aria-label="Close">×</button>
      </div>

      <div className="review-body">
        <div className="review-sidebar">
          <div className="review-select-all" onClick={toggleSelectAll} style={{ cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={checked.size === eligibleSamples.length && eligibleSamples.length > 0}
              ref={(el) => { if (el) el.indeterminate = checked.size > 0 && checked.size < eligibleSamples.length; }}
              onChange={toggleSelectAll}
              onClick={(e) => e.stopPropagation()}
            />
            <span>Select All</span>
            <span className="count">{checked.size}/{eligibleSamples.length}</span>
          </div>

          {eligibleSamples.map((s) => {
            const c = enteredCount(s);
            const complete = c.filled === c.total;
            const isActive = s.id === activeSampleId;
            return (
              <div
                key={s.id}
                className={`review-test-row${isActive ? ' active' : ''}`}
                onClick={() => setActiveSampleId(s.id)}
              >
                <input
                  type="checkbox"
                  checked={checked.has(s.id)}
                  onChange={() => toggleChecked(s.id)}
                  onClick={(e) => e.stopPropagation()}
                  style={{ marginTop: 2 }}
                />
                <div>
                  <div className="name">{s.BillItem?.TestMaster?.testName}</div>
                  <span className={`count-pill${complete ? ' complete' : ''}`}>{c.filled} / {c.total}</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="review-main">
          <div className="review-main-header">
            <h2>{activeSample.BillItem?.TestMaster?.testName}</h2>
            {activeHasChanges && <span className="review-badge delta">Δ Delta</span>}
            <span className={`review-badge entered${activeCount.filled === activeCount.total ? '' : ' partial'}`}>
              {activeCount.filled} / {activeCount.total} Entered
            </span>
          </div>

          {error && <p className="error-text">{error}</p>}

          <div className="review-param-grid">
            {paramsFor(activeSample).map((p) => {
              const value = values[activeSample.id]?.[p.id] || '';
              const abnormal = isOutOfRange(value, p.normalRangeLow, p.normalRangeHigh);
              return (
                <div className="review-param-card" key={p.id}>
                  <div>
                    <div className="p-name">{p.parameterCode ? `[${p.parameterCode}] ` : ''}{p.parameterName}</div>
                    <div className="p-range">Normal: {p.normalRangeLow}–{p.normalRangeHigh}</div>
                  </div>
                  <div className="p-input-wrap">
                    <input
                      className={abnormal ? 'abnormal' : ''}
                      value={value}
                      onChange={(e) => setValue(activeSample.id, p.id, e.target.value)}
                    />
                    <span className="p-unit">{p.unit}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="review-footer">
        <button onClick={handleSubmit} disabled={busy || checkedSamples.length === 0}>
          {busy ? 'Saving…' : allCheckedReady
            ? `Mark Reviewed ${checkedSamples.length} Test${checkedSamples.length === 1 ? '' : 's'}`
            : `Save Results (${checkedSamples.length})`}
        </button>
        <span className="checked-count">{checkedSamples.length} of {eligibleSamples.length} test(s) checked</span>
      </div>
    </div>
  );
}
