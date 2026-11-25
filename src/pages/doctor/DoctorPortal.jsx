import React from 'react';
import { ClinicalWorkspace } from '../../components/staff/ClinicalWorkspace';

export const DoctorPortal = ({ subTab = 'overview', setSubTab }) => (
  <ClinicalWorkspace
    subTab={subTab}
    setSubTab={setSubTab}
    roleLabel="Doctor"
    subtitle="Clinic schedule, consultations, prescriptions and investigations"
  />
);

export default DoctorPortal;
