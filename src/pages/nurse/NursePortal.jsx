import React from 'react';
import { ClinicalWorkspace } from '../../components/staff/ClinicalWorkspace';

export const NursePortal = ({ subTab = 'overview', setSubTab }) => (
  <ClinicalWorkspace
    subTab={subTab}
    setSubTab={setSubTab}
    roleLabel="Nurse"
    subtitle="Ward rounds, vitals and clinical records"
  />
);

export default NursePortal;
