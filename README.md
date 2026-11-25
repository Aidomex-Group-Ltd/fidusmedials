# 🏥 Fidus MC HMS — Frontend Clinical Interface

Modern, high-performance Hospital Management System frontend built with **React 19**, **Vite 8**, and **Lucide React**.

---

## 🚀 Key Technologies & Stack

- **Framework**: React 19 (`react`, `react-dom`)
- **Bundler**: Vite 8 with fast Hot Module Replacement (HMR)
- **Styling**: Pure Modern CSS Design System (Custom Glassmorphism, CSS Custom Properties, Responsive Grid & Flexbox)
- **Icons**: `lucide-react`
- **HTTP Client**: `axios` with global auth interceptors
- **Visual Effects**: `canvas-confetti`

---

## 📦 Project Structure

```
src/
├── assets/          # Static branding, hero graphics, and medical imagery
├── components/      # Modular, reusable clinical components
│   ├── common/      # Navbar, Sidebar, RoleSwitcher, ChatBot, StatCard, Badge, EcgWaveform, Modal
│   ├── emergency/   # AmbulanceTrackerModal (Emergency GPS tracker)
│   ├── lab/         # PathologyReportGeneratorModal (Lab test generator)
│   ├── pharmacy/    # PharmacyDispenserModal & PharmacyInventoryModal
│   ├── scans/       # AiScanAnalyzerModal (AI Computer Vision diagnostic scanner)
│   ├── telehealth/  # TelehealthRoomModal (WebRTC clinical video room)
│   └── triage/      # SymptomTriageModal (AI symptom checker)
├── context/         # AuthContext (Role-Based Access Control) & ToastContext
├── pages/
│   ├── admin/       # AdminPortal (Executive operations, revenue analytics, staff roster)
│   ├── doctor/      # DoctorPortal (OPD queue, digital E-prescriptions, EMR history)
│   ├── patient/     # PatientPortal (Self-service OPD booking, digital RX wallet, scan vault)
│   ├── LandingPage.jsx  # Ultra-modern Hospital Landing Page
│   ├── Login.jsx        # Dedicated Multi-Role Sign In
│   └── Register.jsx     # Patient Registration Page
├── services/        # Centralized REST API client (api.js)
├── styles/          # Design tokens (index.css, components.css)
├── App.jsx          # Top-level application router and RBAC controller
└── main.jsx         # Application root DOM mount
```

---

## 🏃 Running Frontend Locally

```bash
# Install dependencies
npm install

# Start local development server (Vite dev on http://localhost:5173)
make start            # same as: npx vite --port 5173 --host

# Build for production (recommended: run `npm run lint` first)
make build            # same as: npm run build

# Lint
make lint             # same as: npx oxlint

# Preview production build
npm run preview
```

---

## 🔑 Development-only test accounts (demo roles)

All demo/quick-login accounts are **development-only**. They are never exposed in
production and are hidden in the UI outside development. To use them:

1. Start the backend on `http://localhost:5000`.
2. On the dev server, start with `VITE_FAKE_AUTH_TOKEN` empty, then use the
   **Quick demo** panel on the Login page (dev mode).

Use the quick demo launcher on the Login page (development only) to test:
- **Admin**: `munna@gmail.com`
- **Doctor**: `sarah.cardio@fidusmedicals.space`
- **Receptionist**: `reception@fidusmedicals.space`
- **Patient**: `alex.johnson@example.com`
- **Nurse**: `nurse@fidusmedicals.space`
- **Midwife**: `midwife@fidusmedicals.space`
- **Clinician**: `clinician@fidusmedicals.space`
- **Laboratory Staff**: `lab@fidusmedicals.space`
- **Pharmacy Staff**: `pharmacy@fidusmedicals.space`
- **Radiology Staff**: `radiology@fidusmedicals.space`
- **Admin & Finance**: `finance@fidusmedicals.space`

Passwords for seeded accounts are provided by the backend seeder
(`HMS/BACKEND/seeders/seedData.js`). Passwords are **not** stored in the frontend
source; the frontend looks them up via the backend-authenticated demo accounts
approach documented there.

---

## ☁️ Cloudflare backend

When the backend is moved to Cloudflare Workers, see
[cloudflare.md](./cloudflare.md) for the migration/ops plan and verification
steps (start there, especially until we can sign in with `cf auth whoami`).
