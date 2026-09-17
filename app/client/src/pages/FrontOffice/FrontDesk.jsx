import { useEffect, useRef, useState } from 'react';
import api from '../../api/client';
import { Icon } from '../../components/Icons';
import SearchSelect from '../../components/SearchSelect';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function blankPatientForm() {
  return { name: '', age: '', ageUnit: 'Years', gender: 'Male', mobile: '', email: '', address: '' };
}

function IconSearch() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
    </svg>
  );
}

export default function FrontDesk() {
  const [prices, setPrices] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [payors, setPayors] = useState([]);
  const [payorId, setPayorId] = useState('');
  const [payorPrices, setPayorPrices] = useState([]);

  const [searchValue, setSearchValue] = useState('');
  const [patient, setPatient] = useState(null); // found existing patient
  const [patientForm, setPatientForm] = useState(blankPatientForm());
  const [searchMessage, setSearchMessage] = useState('');

  const [selectedTests, setSelectedTests] = useState([]);
  const [testQuery, setTestQuery] = useState('');
  const [showTestResults, setShowTestResults] = useState(false);
  const testBoxRef = useRef(null);

  const [billingType, setBillingType] = useState('DIRECT'); // DIRECT | PAYOR | REFERRAL
  const [doctorName, setDoctorName] = useState('');
  const [walkInDate, setWalkInDate] = useState(todayISO());
  const [discount, setDiscount] = useState('0');
  const [paymentMode, setPaymentMode] = useState('');
  const [visitAddress, setVisitAddress] = useState('');
  const [transactionNumber, setTransactionNumber] = useState('');
  const [remarks, setRemarks] = useState('');
  const isCredit = billingType === 'PAYOR';
  const needsTransactionNumber = !isCredit && (paymentMode === 'Card' || paymentMode === 'UPI');
  const discountGiven = (Number(discount) || 0) > 0;

  const [bill, setBill] = useState(null);
  const [error, setError] = useState('');
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    api.get('/billing/test-prices').then((r) => setPrices(r.data));
    api.get('/doctors').then((r) => setDoctors(r.data));
    api.get('/billing/payors').then((r) => setPayors(r.data));
  }, []);

  useEffect(() => {
    if (!payorId) { setPayorPrices([]); return; }
    api.get(`/billing/payors/${payorId}/test-prices`).then((r) => setPayorPrices(r.data));
  }, [payorId]);

  function effectivePrice(p) {
    if (!payorId) return Number(p.price);
    const override = payorPrices.find((pp) => pp.testId === p.testId);
    return override ? Number(override.price) : Number(p.price);
  }

  useEffect(() => {
    function handleClickOutside(e) {
      if (testBoxRef.current && !testBoxRef.current.contains(e.target)) setShowTestResults(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function handleSearch(e) {
    e.preventDefault();
    setError('');
    setSearchMessage('');
    if (!searchValue.trim()) return;
    const isUmr = /^umr/i.test(searchValue.trim());
    const params = isUmr ? { umr: searchValue.trim() } : { mobile: searchValue.trim() };
    try {
      const { data } = await api.get('/patients/lookup', { params });
      setPatient(data);
      setPatientForm({ name: data.name, age: data.age || '', gender: data.gender || 'Male', mobile: data.mobile || '', email: data.email || '', address: data.address || '' });
      setVisitAddress(data.address || '');
      setSearchMessage(`Existing patient found — ${data.umr}`);
    } catch (err) {
      setPatient(null);
      setPatientForm({ ...blankPatientForm(), mobile: isUmr ? '' : searchValue.trim() });
      setSearchMessage('No existing patient found — enter details below to register.');
    }
  }

  function resetPatient() {
    setPatient(null);
    setPatientForm(blankPatientForm());
    setSearchValue('');
    setSearchMessage('');
  }

  function handleBillingTypeChange(type) {
    setBillingType(type);
    if (type !== 'PAYOR') setPayorId('');
    else { setPaymentMode(''); setTransactionNumber(''); }
    if (type !== 'REFERRAL') setDoctorName('');
  }

  function addTest(testId) {
    setSelectedTests((prev) => [...prev, testId]);
    setTestQuery('');
    setShowTestResults(false);
  }
  function removeTest(testId) {
    setSelectedTests((prev) => prev.filter((id) => id !== testId));
  }

  const selectedPrices = prices.filter((p) => selectedTests.includes(p.testId));
  const availablePrices = prices.filter((p) => !selectedTests.includes(p.testId));
  const testQueryLower = testQuery.toLowerCase();
  const testSuggestions = availablePrices.filter((p) => (
    p.TestMaster?.testName?.toLowerCase().includes(testQueryLower)
    || p.TestMaster?.testCode?.toLowerCase().includes(testQueryLower)
    || p.shortName?.toLowerCase().includes(testQueryLower)
  ));

  const gross = selectedPrices.reduce((s, p) => s + effectivePrice(p), 0);
  const netPayable = Math.max(0, gross - (Number(discount) || 0));

  async function handleGenerateBill(e) {
    e.preventDefault();
    if (generating) return;
    setError('');
    if (!isCredit && !paymentMode) {
      setError('Payment Mode is required.');
      return;
    }
    if (discountGiven && !remarks.trim()) {
      setError('Remarks are required when a discount is given.');
      return;
    }
    if (needsTransactionNumber && !transactionNumber.trim()) {
      setError(`Payment Transaction Number is required for ${paymentMode} payments.`);
      return;
    }
    setGenerating(true);
    try {
      const payload = {
        testIds: selectedTests,
        referredDoctorName: doctorName || undefined,
        walkInDate,
        discount: Number(discount) || 0,
        paymentMode: isCredit ? undefined : paymentMode,
        visitAddress,
        transactionNumber: needsTransactionNumber ? transactionNumber : undefined,
        remarks,
        payorId: payorId || undefined,
      };
      if (patient) {
        payload.patientId = patient.id;
      } else {
        if (!patientForm.name) throw { response: { data: { message: 'Patient name is required' } } };
        Object.assign(payload, patientForm, { age: patientForm.age ? Number(patientForm.age) : null });
      }

      const { data } = await api.post('/billing/bills', payload);
      const { data: full } = await api.get(`/billing/bills/${data.id}`);
      setBill(full);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to generate bill');
    } finally {
      setGenerating(false);
    }
  }

  function startNewBill() {
    setBill(null);
    resetPatient();
    setSelectedTests([]);
    setBillingType('DIRECT');
    setDoctorName('');
    setPayorId('');
    setDiscount('0');
    setPaymentMode('');
    setVisitAddress('');
    setTransactionNumber('');
    setRemarks('');
    setWalkInDate(todayISO());
    api.get('/doctors').then((r) => setDoctors(r.data));
  }

  if (bill) {
    return (
      <div className="card">
        <h3 className="section-heading"><span className="icon-badge"><Icon name="orders" size={16} /></span> Receipt — Order {bill.billNo}</h3>
        <p>UMR: <strong>{bill.Patient?.umr}</strong> · Patient: {bill.Patient?.name}</p>
        {bill.ReferralDoctor?.name && <p>Referred By: Dr. {bill.ReferralDoctor.name}</p>}
        {bill.Payor?.name && <p>Billed To Credit Client: <strong>{bill.Payor.name}</strong></p>}
        {bill.transactionNumber && <p>Payment Transaction Number: <strong>{bill.transactionNumber}</strong></p>}
        <table>
          <thead><tr><th>Test</th><th>Barcode</th><th>Price</th></tr></thead>
          <tbody>
            {bill.BillItems.map((item) => (
              <tr key={item.id}>
                <td>{item.TestMaster?.testName}</td>
                <td>{item.Sample?.barcode}</td>
                <td>₹{item.price}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>Gross: ₹{bill.totalAmount} &nbsp; Discount: ₹{bill.discount} &nbsp; <strong>Net Payable: ₹{bill.paidAmount}</strong></p>
        <button onClick={() => window.print()}>Print Bill</button>{' '}
        <button className="secondary" onClick={startNewBill}>New Bill</button>
      </div>
    );
  }

  return (
    <div>
      <div className="card">
        <span style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13 }}>Billing Type</span>
        <div className="segmented-toggle">
          <button type="button" className={billingType === 'DIRECT' ? 'active' : ''} onClick={() => handleBillingTypeChange('DIRECT')}>Direct</button>
          <button type="button" className={billingType === 'PAYOR' ? 'active' : ''} onClick={() => handleBillingTypeChange('PAYOR')}>Credit</button>
          <button type="button" className={billingType === 'REFERRAL' ? 'active' : ''} onClick={() => handleBillingTypeChange('REFERRAL')}>Referral</button>
        </div>

        {billingType === 'DIRECT' && (
          <p style={{ fontSize: 12, color: '#94a3b8', marginTop: -10, marginBottom: 14 }}>
            The patient pays at the counter, at the client's standard test prices.
          </p>
        )}

        {billingType === 'PAYOR' && (
          <>
            <div style={{ maxWidth: 340, marginBottom: 6 }}>
              <span style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13 }}>Credit Client (corporate / TPA / insurer)</span>
              <SearchSelect
                options={payors.map((p) => ({ value: p.id, label: `${p.name} (${p.billingCycle === 'WEEKLY' ? 'Weekly' : 'Monthly'} billing)` }))}
                value={payorId}
                onChange={setPayorId}
                placeholder="Search credit client…"
              />
            </div>
            <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 0, marginBottom: 14 }}>
              Tests below will be priced at this credit client's negotiated rate and invoiced to them on their own
              billing cycle (monthly or weekly) instead of the patient paying now.
            </p>
          </>
        )}

        {billingType === 'REFERRAL' && (
          <>
            <label style={{ maxWidth: 340 }}><span>Referred By (Doctor)</span>
              <input
                list="doctor-suggestions"
                value={doctorName}
                onChange={(e) => setDoctorName(e.target.value)}
                placeholder="Doctor's name"
              />
              <datalist id="doctor-suggestions">
                {doctors.map((d) => <option key={d.id} value={d.name} />)}
              </datalist>
            </label>
            <p style={{ fontSize: 12, color: '#94a3b8', marginTop: -10, marginBottom: 14 }}>
              The patient still pays at the counter; the doctor is recorded for commission tracking.
            </p>
          </>
        )}

        <form onSubmit={handleSearch} className="form-grid" style={{ alignItems: 'end' }}>
          <label><span>Search by UMR or Mobile</span>
            <input value={searchValue} onChange={(e) => setSearchValue(e.target.value)} placeholder="UMR000012 or 98765xxxxx" />
          </label>
          <button type="submit">Search</button>
          {(patient || searchMessage) && <button type="button" className="secondary" onClick={resetPatient}>Clear</button>}
        </form>
        {searchMessage && <p style={{ color: patient ? '#166534' : '#854d0e', fontSize: 13 }}>{searchMessage}</p>}

        <div className="form-grid">
          <label><span>Mobile No *</span>
            <input
              value={patientForm.mobile}
              onChange={(e) => setPatientForm((f) => ({ ...f, mobile: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
              disabled={!!patient}
              inputMode="numeric"
              maxLength={10}
              required
            />
          </label>
          <label><span>Patient Name *</span>
            <input value={patientForm.name} onChange={(e) => setPatientForm((f) => ({ ...f, name: e.target.value }))} disabled={!!patient} required />
          </label>
          <label><span>Gender</span>
            <select value={patientForm.gender} onChange={(e) => setPatientForm((f) => ({ ...f, gender: e.target.value }))} disabled={!!patient}>
              <option>Male</option><option>Female</option><option>Other</option>
            </select>
          </label>
          <label><span>Age</span>
            <input type="number" value={patientForm.age} onChange={(e) => setPatientForm((f) => ({ ...f, age: e.target.value }))} disabled={!!patient} />
          </label>
          <label><span>Email (optional)</span>
            <input value={patientForm.email} onChange={(e) => setPatientForm((f) => ({ ...f, email: e.target.value }))} disabled={!!patient} />
          </label>
          {patient && <label><span>UMR No</span><input value={patient.umr} disabled /></label>}
          <label><span>Walk-in On</span>
            <input type="date" value={walkInDate} onChange={(e) => setWalkInDate(e.target.value)} />
          </label>
        </div>
      </div>

      <div className="card">
        <h3 className="step-heading">1. Bill Items <span className="step-hint">— add at least 1 item</span></h3>

        <div className="bill-items-box" ref={testBoxRef}>
          <div className="bill-items-search">
            <IconSearch />
            <input
              placeholder="Search & tap a test to add…"
              value={testQuery}
              onChange={(e) => { setTestQuery(e.target.value); setShowTestResults(true); }}
              onFocus={() => setShowTestResults(true)}
            />
            {showTestResults && (
              <div className="search-select-results" style={{ position: 'absolute', top: '100%', marginTop: 4 }}>
                {testSuggestions.slice(0, 30).map((p) => (
                  <div key={p.id} className="search-select-item" onClick={() => addTest(p.testId)}>
                    {p.TestMaster?.testName}
                    {p.shortName && <span style={{ color: '#94a3b8' }}> ({p.shortName})</span>}
                    <span style={{ color: '#64748b' }}> · ₹{effectivePrice(p)}</span>
                  </div>
                ))}
                {testSuggestions.length === 0 && <div className="search-select-item search-select-empty">No matching tests</div>}
              </div>
            )}
          </div>

          {selectedPrices.length > 0 && (
            <div className="selected-items-list">
              {selectedPrices.map((p) => (
                <div className="selected-item-row" key={p.id}>
                  <span>{p.TestMaster?.testName}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    ₹{effectivePrice(p)}
                    <button type="button" onClick={() => removeTest(p.testId)}>Remove</button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="pay-stat-row">
          <div className="pay-stat-tile"><div className="label">Gross</div><div className="value">₹{gross}</div></div>
          <div className="pay-stat-tile discount">
            <div className="label">Discount</div>
            <input type="number" min={0} value={discount} onChange={(e) => setDiscount(e.target.value)} style={{ textAlign: 'center' }} />
          </div>
          <div className="pay-stat-tile net-payable"><div className="label">Net Payable</div><div className="value">₹{netPayable}</div></div>
        </div>
      </div>

      <div className="card">
        <h3 className="step-heading">2. Payment</h3>

        <div className="review-box">
          <div className="review-box-row"><span>Patient</span><span>{patient?.name || patientForm.name || '—'}</span></div>
          <div className="review-box-row"><span>Items</span><span>{selectedPrices.length} item(s)</span></div>
          <div className="review-box-row"><span>Net Payable</span><span>₹{netPayable}</span></div>
        </div>

        {isCredit && (
          <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 0, marginBottom: 14 }}>
            No payment mode needed — this bill is charged to the credit client and settled later, not paid at the counter.
          </p>
        )}

        <div className="form-grid">
          {!isCredit && (
            <label><span>Payment Mode *</span>
              <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)} required>
                <option value="">— Select —</option>
                <option>Cash</option><option>Card</option><option>UPI</option><option>Insurance</option>
              </select>
            </label>
          )}
          <label><span>Address (optional)</span>
            <input value={visitAddress} onChange={(e) => setVisitAddress(e.target.value)} />
          </label>
          {needsTransactionNumber && (
            <label><span>Payment Transaction Number *</span>
              <input
                value={transactionNumber}
                onChange={(e) => setTransactionNumber(e.target.value)}
                placeholder={`${paymentMode} reference / transaction ID`}
                required
              />
            </label>
          )}
          <label><span>Remarks{discountGiven ? ' *' : ' (optional)'}</span>
            <input
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder={discountGiven ? 'Required — reason for the discount' : 'Any notes…'}
              required={discountGiven}
            />
          </label>
        </div>
        {error && <p className="error-text">{error}</p>}
        <button onClick={handleGenerateBill} disabled={generating || selectedTests.length === 0 || (!isCredit && !paymentMode)}>{generating ? 'Generating…' : 'Generate Bill'}</button>
      </div>
    </div>
  );
}
