import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { documentService, workflowService } from '../services/api';
import { Modal } from '../components/common/Modal';
import {
  FolderLock,
  UploadCloud,
  FileText,
  Image as ImageIcon,
  Trash2,
  Eye,
  Search,
  Download,
  ExternalLink,
  X,
} from 'lucide-react';

const CATEGORIES = [
  'Lab Report',
  'X-Ray / MRI Scan',
  'Discharge Summary',
  'Prescription Copy',
  'Insurance Doc',
  'Other',
];

const MAX_BYTES = 10 * 1024 * 1024;
const isImage = (doc) => String(doc?.contentType || '').startsWith('image/');

const formatSize = (bytes) => {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

/**
 * Medical document vault.
 *
 * Staff upload against a registered patient and can see the facility vault;
 * patients only ever see their own documents because the API scopes the list
 * server-side. File bodies are streamed from R2 with the caller's bearer token.
 */
export const MedicalFiles = () => {
  const { isPatient } = useAuth();
  const toast = useToast();
  const fileInputRef = useRef(null);

  const [files, setFiles] = useState([]);
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);

  const [form, setForm] = useState({ title: '', category: 'Lab Report', patientUserId: '', notes: '' });
  const [viewer, setViewer] = useState(null);

  const load = async () => {
    try {
      setLoading(true);
      const res = await documentService.list(categoryFilter ? { category: categoryFilter } : undefined);
      setFiles(res?.data?.items || []);
    } catch (err) {
      toast.error(err.message || 'Failed to load the document vault.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [categoryFilter]);

  useEffect(() => {
    if (!isPatient) {
      workflowService
        .listPatients()
        .then((res) => setPatients(res?.data?.items || []))
        .catch(() => {});
    }
  }, [isPatient]);

  useEffect(
    () => () => {
      if (viewer?.url) URL.revokeObjectURL(viewer.url);
    },
    [viewer],
  );

  const selectFile = (file) => {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      toast.error('Documents must be 10 MB or smaller.');
      return;
    }
    setSelectedFile(file);
    setForm((prev) => ({ ...prev, title: prev.title || file.name.replace(/\.[^/.]+$/, '') }));
  };

  const upload = async (event) => {
    event.preventDefault();
    if (!selectedFile) {
      toast.warning('Select a file to upload.');
      return;
    }
    if (!isPatient && !form.patientUserId) {
      toast.warning('Select the patient this document belongs to.');
      return;
    }

    try {
      setUploading(true);
      const body = new FormData();
      body.append('file', selectedFile);
      body.append('title', form.title || selectedFile.name);
      body.append('category', form.category);
      body.append('notes', form.notes);
      if (!isPatient) body.append('patientUserId', form.patientUserId);

      await documentService.upload(body);
      toast.success('Document added to the vault.');
      setSelectedFile(null);
      setForm({ title: '', category: 'Lab Report', patientUserId: '', notes: '' });
      if (fileInputRef.current) fileInputRef.current.value = '';
      await load();
    } catch (err) {
      toast.error(err.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const view = async (doc) => {
    try {
      const blob = await documentService.fetchBlob(doc.id);
      setViewer({ doc, url: URL.createObjectURL(blob) });
    } catch (err) {
      toast.error(err.message || 'Could not open the document.');
    }
  };

  const download = async (doc) => {
    try {
      const blob = await documentService.downloadBlob(doc.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = doc.fileName || 'document';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      toast.error(err.message || 'Could not download the document.');
    }
  };

  const remove = async (doc) => {
    if (!window.confirm(`Delete “${doc.title}” from the vault?`)) return;
    try {
      await documentService.remove(doc.id);
      toast.success('Document removed.');
      await load();
    } catch (err) {
      toast.error(err.message || 'Could not delete the document.');
    }
  };

  const closeViewer = () => {
    if (viewer?.url) URL.revokeObjectURL(viewer.url);
    setViewer(null);
  };

  const filtered = files.filter((doc) => {
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return (
      String(doc.title || '').toLowerCase().includes(term) ||
      String(doc.patient?.name || '').toLowerCase().includes(term) ||
      String(doc.patient?.patientNumber || '').toLowerCase().includes(term)
    );
  });

  return (
    <div>
      <section className="portal-hero">
        <div className="portal-hero-main">
          <div>
            <div className="portal-hero-meta">
              <span className="portal-status-pill">Records</span>
              <span>Document vault</span>
            </div>
            <h1 className="portal-hero-title">Medical document vault</h1>
            <p className="portal-hero-sub">Secure storage for scans, reports, discharge summaries and insurance documents.</p>
          </div>
        </div>
      </section>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="card-header">
          <div>
            <h2 className="card-title">Upload a document</h2>
            <p className="card-subtitle">PDF, JPEG, PNG, WebP or GIF · up to 10 MB</p>
          </div>
        </div>
        <form onSubmit={upload} style={{ padding: '0 1rem 1rem' }}>
          <div
            className="file-upload-zone"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              selectFile(event.dataTransfer.files?.[0]);
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            <UploadCloud size={34} color="var(--primary-600)" style={{ margin: '0 auto 0.6rem auto' }} />
            <div style={{ fontWeight: 700 }}>{selectedFile ? selectedFile.name : 'Click to browse or drop a file here'}</div>
            <div className="text-muted-sm" style={{ marginTop: 4 }}>
              {selectedFile ? formatSize(selectedFile.size) : 'Files are stored in Cloudflare R2, not in the database.'}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp,image/gif"
              style={{ display: 'none' }}
              onChange={(event) => selectFile(event.target.files?.[0])}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', marginTop: '1rem' }}>
            <label>
              Document title
              <input
                className="form-control"
                required
                value={form.title}
                onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                placeholder="Chest X-Ray PA view"
              />
            </label>
            <label>
              Category
              <select className="form-control" value={form.category} onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}>
                {CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
            {!isPatient && (
              <label>
                Patient
                <select
                  className="form-control"
                  required
                  value={form.patientUserId}
                  onChange={(event) => setForm((prev) => ({ ...prev, patientUserId: event.target.value }))}
                >
                  <option value="">— Select patient —</option>
                  {patients.map((patient) => (
                    <option key={patient.id} value={patient.id}>
                      {patient.name} ({patient.patient_number || patient.email})
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <label style={{ display: 'block', marginTop: '0.75rem' }}>
            Notes / findings
            <input
              className="form-control"
              value={form.notes}
              onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
              placeholder="Optional clinical context"
            />
          </label>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.75rem' }}>
            <button type="submit" className="btn btn-primary" disabled={uploading || !selectedFile}>
              {uploading ? 'Uploading…' : 'Upload document'}
            </button>
          </div>
        </form>
      </div>

      <div className="filter-bar">
        <div className="filter-search">
          <Search size={16} />
          <input className="form-control" placeholder="Search by title or patient…" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <div className="filter-select">
          <select className="form-control" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
            <option value="">All categories</option>
            {CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="empty-state">
          <div className="app-loading-spinner" style={{ margin: '0 auto 0.75rem auto' }} />
          <p>Loading documents…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card empty-state">
          <FolderLock size={28} style={{ color: 'var(--slate-400)', marginBottom: 8 }} />
          <p style={{ fontWeight: 600 }}>No documents yet</p>
          <p className="text-muted-sm">Upload a report or scan to start the vault.</p>
        </div>
      ) : (
        <div className="files-grid">
          {filtered.map((doc) => (
            <div key={doc.id} className="file-card">
              <div className="file-card-preview" style={{ cursor: 'pointer' }} onClick={() => view(doc)}>
                {isImage(doc) ? <ImageIcon size={40} color="#38bdf8" /> : <FileText size={40} color="#38bdf8" />}
                <div
                  style={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    background: 'rgba(15, 23, 42, 0.75)',
                    padding: '0.2rem 0.5rem',
                    borderRadius: 4,
                    color: '#fff',
                    fontSize: '0.7rem',
                  }}
                >
                  {doc.category}
                </div>
              </div>

              <div className="file-card-details">
                <div style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.title}</div>
                <div className="text-muted-sm">
                  Patient: <strong>{doc.patient?.name || '—'}</strong>
                  {doc.patient?.patientNumber ? ` (${doc.patient.patientNumber})` : ''}
                </div>
                <div className="text-muted-sm">
                  {formatSize(doc.sizeBytes)} · {new Date(doc.createdAt).toLocaleDateString()}
                  {doc.uploadedBy ? ` · ${doc.uploadedBy}` : ''}
                </div>
                {doc.notes && <div style={{ fontSize: '0.75rem', color: 'var(--slate-600)', marginTop: 4 }}>{doc.notes}</div>}

                <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid var(--slate-100)' }}>
                  <button className="btn btn-outline-primary btn-sm" onClick={() => view(doc)}>
                    <Eye size={13} /> View
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={() => download(doc)}>
                    <Download size={13} /> Download
                  </button>
                  <button
                    className="btn btn-danger-soft btn-sm"
                    style={{ marginLeft: 'auto' }}
                    onClick={() => remove(doc)}
                    title="Delete document"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {viewer && (
        <Modal isOpen title={viewer.doc.title} onClose={closeViewer} maxWidth="820px">
          <div style={{ background: '#0f172a', borderRadius: 12, padding: '0.75rem', textAlign: 'center', marginBottom: '1rem' }}>
            {isImage(viewer.doc) ? (
              <img src={viewer.url} alt={viewer.doc.title} style={{ maxWidth: '100%', maxHeight: 520, objectFit: 'contain' }} />
            ) : (
              <div style={{ color: '#fff', padding: '2.5rem 1rem' }}>
                <FileText size={48} color="#38bdf8" style={{ margin: '0 auto 0.75rem auto' }} />
                <p style={{ marginBottom: '1rem' }}>PDF previews open in a new tab.</p>
                <a href={viewer.url} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm">
                  <ExternalLink size={14} /> Open document
                </a>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
            <span className="text-muted-sm">
              {viewer.doc.patient?.name} · {viewer.doc.category} · {formatSize(viewer.doc.sizeBytes)}
            </span>
            <button className="btn btn-secondary btn-sm" onClick={() => download(viewer.doc)}>
              <Download size={14} /> Download
            </button>
          </div>
          <div className="modal-footer" style={{ marginTop: '1rem' }}>
            <button className="btn btn-secondary" onClick={closeViewer}>
              <X size={14} /> Close
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
};
