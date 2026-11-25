import React from 'react';
import { ClinicalWorkspace } from '../../components/staff/ClinicalWorkspace';

export const MidwifePortal = ({ subTab = 'overview', setSubTab }) => (
  <ClinicalWorkspace
    subTab={subTab}
    setSubTab={setSubTab}
    roleLabel="Midwife"
    subtitle="Antenatal, delivery and postnatal care"
  />
);

export default MidwifePortal;
