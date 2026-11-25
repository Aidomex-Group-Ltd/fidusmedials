import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { dashboardService, workflowService } from '../../services/api';
import { StatCard } from '../../components/common/StatCard';
import { Modal } from '../../components/common/Modal';
import { QueueState, PatientPicker, useAsync, useQueue } from '../../components/staff/StaffWorkflow';
import { BarChart3, Receipt, CreditCard, PiggyBank, TrendingUp, Clock } from 'lucide-react';

const TABS = [
  { id: 'dashboard', label: 'Finance Overview', icon: BarChart3 },
  { id: 'invoices', label: 'Invoices', icon: Receipt },
  { id: 'payments', label: 'Payments & Collections', icon: CreditCard },
  { id: 'reports', label: 'Financial Reports', icon: PiggyBank },
];

const money = (amount, currency = 'UGX') =>
  `${currency} ${Number(amount || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export const FinancePortal = ({ subTab = 'dashboard', setSubTab }) => {
  const { user } = useAuth();
  const toast = useToast();
  const currentTab = subTab || 'dashboard';

  const invoices = useQueue('invoices');
  const payments = useAsync(async () => (await workflowService.payments())?.data?.items || [], []);
  const stats = useAsync(() => dashboardService.getStats(), []);

  const [isInvoiceOpen, setIsInvoiceOpen] = useState(false);
  const [patient, setPatient] = useState(null);
  const [invoiceLines, setInvoiceLines] = useState([{ description: '', quantity: 1, unit_price: 0 }]);
  const [service, setService] = useState('');
  const [busy, setBusy] = useState(false);

  const [paymentFor, setPaymentFor] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentRef, setPaymentRef] = useState('');

  const counts = stats.data?.data?.counts || {};
  const finance = stats.data?.data?.finance || {};

  const resetInvoice = () => {
    setPatient(null);
    setService('');
    setInvoiceLines([{ description: '', quantity: 1, unit_price: 0 }]);
  };

  const createInvoice = async (event) => {
    event.preventDefault();
    if (!patient) {
      toast.warning('Select the patient this invoice belongs to.');
      return;
    }
    const items = invoiceLines
      .filter((line) => line.description.trim() && Number(line.unit_price) > 0)
      .map((line) => ({ ...line, quantity: Number(line.quantity) || 1, unit_price: Number(line.unit_price) }));
    if (!items.length) {
      toast.warning('Add at least one billable line with an amount.');
      return;
    }
    try {
      setBusy(true);
      const res = await workflowService.createInvoice({ patientUserId: patient.id, service, items, currency: 'UGX' });
      toast.success(`Invoice ${res?.data?.number} issued — the patient can see it now.`);
      setIsInvoiceOpen(false);
      resetInvoice();
      await invoices.reload();
      await stats.reload();
    } catch (err) {
      toast.error(err.message || 'Could not issue the invoice.');
    } finally {
      setBusy(false);
    }
  };

  const recordPayment = async (event) => {
    event.preventDefault();
    const amount = Number(paymentAmount);
    if (!(amount > 0)) {
      toast.warning('Enter the amount received.');
      return;
    }
    try {
      setBusy(true);
      await workflowService.recordPayment({
        invoiceId: paymentFor.id,
        amount,
        method: paymentMethod,
        reference: paymentRef,
      });
      toast.success('Payment recorded. It must be verified before the invoice balance changes.');
      setPaymentFor(null);
      setPaymentAmount('');
      setPaymentRef('');
      await payments.reload();
    } catch (err) {
      toast.error(err.message || 'Could not record the payment.');
    } finally {
      setBusy(false);
    }
  };

  const verify = async (payment) => {
    try {
      setBusy(true);
      await workflowService.verifyPayment({ paymentId: payment.id });
      toast.success('Payment verified — invoice balance updated.');
      await payments.reload();
      await invoices.reload();
      await stats.reload();
    } catch (err) {
      toast.error(err.message || 'Could not verify the payment.');
    } finally {
      setBusy(false);
    }
  };

  const invoiceRows = invoices.items;

  return (
    <div>
      <section className="portal-hero">
        <div className="portal-hero-main">
          <div
            className="portal-hero-avatar"
            aria-hidden="true"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--success-50)', color: 'var(--success-600)', fontWeight: 700 }}
          >
            {(user?.name || 'F').slice(0, 1).toUpperCase()}
          </div>
          <div>
            <div className="portal-hero-meta">
              <span className="portal-status-pill">Finance</span>
              <span>{user?.department || 'Finance and Accounts'}</span>
            </div>
            <h1 className="portal-hero-title">{user?.name || 'Admin & Finance'}</h1>
            <p className="portal-hero-sub">Invoicing, collections and verified payments</p>
          </div>
        </div>
        <div className="portal-hero-actions">
          <button className="btn btn-primary" onClick={() => setIsInvoiceOpen(true)}>
            <Receipt size={16} /> New invoice
          </button>
          <button className="btn btn-secondary" onClick={() => { invoices.reload(); payments.reload(); stats.reload(); }}>
            Refresh
          </button>
        </div>
      </section>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.5rem' }}>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`portal-chip ${currentTab === id ? 'is-selected' : ''}`}
            style={currentTab === id ? { background: 'var(--primary-600)', color: '#fff', borderColor: 'var(--primary-600)' } : {}}
            onClick={() => setSubTab?.(id)}
          >
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {currentTab === 'dashboard' && (
        <div className="stats-grid">
          <StatCard label="Outstanding" value={money(finance.outstanding, finance.currency)} subtext={`${counts.openInvoices ?? 0} open invoice(s)`} icon={Clock} color={finance.outstanding > 0 ? 'rose' : 'emerald'} />
          <StatCard label="Collected" value={money(finance.collected, finance.currency)} subtext="Verified payments only" icon={TrendingUp} color="emerald" />
          <StatCard label="Invoices" value={invoiceRows.length} subtext="In my scope" icon={Receipt} color="teal" />
          <StatCard label="Payments to verify" value={(payments.data || []).filter((p) => p.status === 'recorded').length} subtext="Awaiting confirmation" icon={CreditCard} color="amber" />
        </div>
      )}

      {(currentTab === 'invoices' || currentTab === 'dashboard') && (
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">Invoices</h2>
              <p className="card-subtitle">Issued invoices are visible to the patient immediately</p>
            </div>
          </div>
          <QueueState
            loading={invoices.loading}
            error={invoices.error}
            onRetry={invoices.reload}
            empty={invoiceRows.length === 0}
            emptyTitle="No invoices yet"
            emptyDescription="Issue an invoice to bill a patient for services."
          >
            <div className="table-container">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Patient</th>
                    <th>Issued</th>
                    <th>Total</th>
                    <th>Paid</th>
                    <th>Balance</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invoiceRows.map((invoice) => (
                    <tr key={invoice.id}>
                      <td>
                        <strong>{invoice.number}</strong>
                      </td>
                      <td>{invoice.patient_name || 'Patient'}</td>
                      <td>{new Date(invoice.issued_at).toLocaleDateString()}</td>
                      <td>{money(invoice.total, invoice.currency)}</td>
                      <td>{money(invoice.amount_paid, invoice.currency)}</td>
                      <td>{money(Number(invoice.total) - Number(invoice.amount_paid), invoice.currency)}</td>
                      <td>{invoice.status.replace(/_/g, ' ')}</td>
                      <td>
                        <button className="btn btn-outline-primary btn-sm" onClick={() => setPaymentFor(invoice)}>
                          Record payment
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </QueueState>
        </div>
      )}

      {(currentTab === 'payments' || currentTab === 'dashboard') && (
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">Payments</h2>
              <p className="card-subtitle">Recording a payment does not settle the invoice — verification does</p>
            </div>
          </div>
          <QueueState
            loading={payments.loading}
            error={payments.error}
            onRetry={payments.reload}
            empty={(payments.data || []).length === 0}
            emptyTitle="No payments recorded"
            emptyDescription="Payments recorded against invoices appear here for verification."
          >
            <div className="table-container">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Patient</th>
                    <th>Amount</th>
                    <th>Method</th>
                    <th>Recorded</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(payments.data || []).map((payment) => (
                    <tr key={payment.id}>
                      <td>{payment.invoice_number}</td>
                      <td>{payment.patient_name || 'Patient'}</td>
                      <td>{money(payment.amount, payment.currency)}</td>
                      <td>
                        {payment.method || '—'}
                        {payment.reference ? ` • ${payment.reference}` : ''}
                      </td>
                      <td>{new Date(payment.created_at).toLocaleDateString()}</td>
                      <td>{payment.status}</td>
                      <td>
                        {payment.status === 'recorded' ? (
                          <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => verify(payment)}>
                            Verify
                          </button>
                        ) : (
                          <span style={{ fontSize: '0.8rem', color: 'var(--slate-500)' }}>
                            {payment.verified_at ? new Date(payment.verified_at).toLocaleDateString() : '—'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </QueueState>
        </div>
      )}

      {currentTab === 'reports' && (
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">Financial summary</h2>
              <p className="card-subtitle">Derived from verified payments and open invoices only</p>
            </div>
          </div>
          <QueueState
            loading={stats.loading}
            error={stats.error}
            onRetry={stats.reload}
            empty={false}
            emptyTitle=""
            emptyDescription=""
          >
            <dl style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '0.5rem 1rem', padding: '1rem' }}>
              <dt>Outstanding balance</dt>
              <dd>{money(finance.outstanding, finance.currency)}</dd>
              <dt>Collected (verified)</dt>
              <dd>{money(finance.collected, finance.currency)}</dd>
              <dt>Open invoices</dt>
              <dd>{counts.openInvoices ?? 0}</dd>
              <dt>Invoices issued to date (my scope)</dt>
              <dd>{invoiceRows.length}</dd>
              <dt>Payments awaiting verification</dt>
              <dd>{(payments.data || []).filter((p) => p.status === 'recorded').length}</dd>
              <dt>Snapshot generated</dt>
              <dd>{stats.data?.data?.generatedAt ? new Date(stats.data.data.generatedAt).toLocaleString() : '—'}</dd>
            </dl>
          </QueueState>
        </div>
      )}

      {isInvoiceOpen && (
        <Modal isOpen title="Issue an invoice" onClose={() => setIsInvoiceOpen(false)}>
          <form onSubmit={createInvoice}>
            <PatientPicker selected={patient} onSelect={setPatient} />
            <label style={{ display: 'block', marginTop: '0.75rem' }}>
              Service summary
              <input className="form-control" value={service} onChange={(event) => setService(event.target.value)} placeholder="Consultation and laboratory" />
            </label>
            <div style={{ marginTop: '0.75rem' }}>
              {invoiceLines.map((line, index) => (
                <div key={index} style={{ display: 'grid', gridTemplateColumns: '2fr 0.6fr 1fr', gap: '0.4rem', marginBottom: '0.4rem' }}>
                  <input
                    className="form-control"
                    placeholder="Description"
                    value={line.description}
                    onChange={(event) => setInvoiceLines((prev) => prev.map((l, i) => (i === index ? { ...l, description: event.target.value } : l)))}
                  />
                  <input
                    className="form-control"
                    type="number"
                    min="1"
                    value={line.quantity}
                    onChange={(event) => setInvoiceLines((prev) => prev.map((l, i) => (i === index ? { ...l, quantity: event.target.value } : l)))}
                  />
                  <input
                    className="form-control"
                    type="number"
                    min="0"
                    placeholder="Unit price"
                    value={line.unit_price}
                    onChange={(event) => setInvoiceLines((prev) => prev.map((l, i) => (i === index ? { ...l, unit_price: event.target.value } : l)))}
                  />
                </div>
              ))}
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setInvoiceLines((prev) => [...prev, { description: '', quantity: 1, unit_price: 0 }])}
              >
                Add line
              </button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setIsInvoiceOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? 'Issuing…' : 'Issue invoice'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {paymentFor && (
        <Modal isOpen title={`Record payment — ${paymentFor.number}`} onClose={() => setPaymentFor(null)}>
          <p style={{ fontSize: '0.85rem', color: 'var(--slate-600)' }}>
            Balance: <strong>{money(Number(paymentFor.total) - Number(paymentFor.amount_paid), paymentFor.currency)}</strong>
          </p>
          <form onSubmit={recordPayment}>
            <label style={{ display: 'block' }}>
              Amount received
              <input className="form-control" type="number" min="1" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} />
            </label>
            <label style={{ display: 'block', marginTop: '0.5rem' }}>
              Method
              <select className="form-control" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
                <option value="cash">Cash</option>
                <option value="mobile_money">Mobile money</option>
                <option value="card">Card</option>
                <option value="bank_transfer">Bank transfer</option>
                <option value="insurance">Insurance</option>
              </select>
            </label>
            <label style={{ display: 'block', marginTop: '0.5rem' }}>
              Reference
              <input className="form-control" value={paymentRef} onChange={(event) => setPaymentRef(event.target.value)} placeholder="Receipt or transaction reference" />
            </label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setPaymentFor(null)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                Record payment
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
