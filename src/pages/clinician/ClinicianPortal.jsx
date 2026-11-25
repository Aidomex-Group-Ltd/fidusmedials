import React from 'react';
import { ClinicalWorkspace } from '../../components/staff/ClinicalWorkspace';

export const ClinicianPortal = ({ subTab = 'overview', setSubTab }) => (
  <ClinicalWorkspace
    subTab={subTab}
    setSubTab={setSubTab}
    roleLabel="Clinician"
    subtitle="Consultations, diagnoses and referrals"
  />
);

export default ClinicianPortal;
