export const LANDING_BRAND = {
  name: 'Fidus Medical Center',
  shortName: 'Fidus Medical Center',
  tagline: 'Healthcare, connected to you.',
  address: 'Bugembegembe Wakiso',
};

export const LANDING_CONTACT = {
  address: LANDING_BRAND.address,
  whatsapp: '256751597517',
  whatsappDisplay: '+256751597517',
  phone: '+256705353035',
  email: 'fidusmedicalcenter@gmail.com',
};

export const TEL_URL = (number) =>
  number.trim() === '' ? 'javascript:void(0)' : `tel:${number.trim()}`;

export const MAILTO_URL = (email) =>
  email.trim() === '' ? 'javascript:void(0)' : `mailto:${email.trim()}`;

export const WHATSAPP_URL = (number) =>
  number.trim() === ''
    ? '#'
    : `https://wa.me/${number.trim()}?text=${encodeURIComponent('Hello, I would like to enquire about services at Fidus Medical Center.')}`;

export const LANDING_NAV = [
  { id: 'about', label: 'About' },
  { id: 'services', label: 'Services' },
  { id: 'programmes', label: 'Programmes' },
  { id: 'contact', label: 'Contact' },
];

export const HERO_IMAGE = '/images/modern-hospital-entrance-dusk.png';

export const FEATURED_SERVICES = [
  {
    icon: 'CalendarCheck',
    title: 'Online Appointments',
    text: 'Book clinic visits and consultations at your convenience.',
  },
  {
    icon: 'Video',
    title: 'Virtual Consultations',
    text: 'Connect with healthcare professionals through secure telemedicine.',
  },
  {
    icon: 'HouseHeart',
    title: 'Home Healthcare',
    text: 'Receive nursing care, assessments and treatments at home.',
  },
  {
    icon: 'ShieldCheck',
    title: 'Health Screening',
    text: 'Preventive assessments for individuals, groups and institutions.',
  },
];

export const DIGITAL_SERVICES = [
  { icon: 'CalendarCheck', title: 'Online Appointment Booking', text: 'Schedule visits, follow-ups and consultations from anywhere.' },
  { icon: 'Video', title: 'Virtual Medical Consultations', text: 'Speak with clinicians through secure video and voice sessions.' },
  { icon: 'PhoneCall', title: 'Telemedicine Voice & Video', text: 'Access care remotely when an in-person visit is not required.' },
  { icon: 'MessageCircleQuestion', title: 'Medical Question Clarification', text: 'Get clear guidance from healthcare professionals on your concerns.' },
  { icon: 'Stethoscope', title: 'Access to Healthcare Professionals', text: 'Reach the right clinician for advice, follow-up and coordination.' },
  { icon: 'ClipboardCheck', title: 'Patient Follow-up & Care Coordination', text: 'Stay connected after visits with coordinated care and follow-up plans.' },
];

export const FACILITY_SERVICES = [
  { icon: 'CalendarCheck', title: 'Appointments & Consultations', text: 'Book a visit with our care team or walk in for guided support.' },
  { icon: 'Baby', title: 'Family & Child Health', text: 'Routine checkups and follow-up care for children and families.' },
  { icon: 'HeartPulse', title: 'Women’s Health & Maternity', text: 'Pregnancy, delivery and postnatal support from our maternity team.' },
  { icon: 'Microscope', title: 'Laboratory Services', text: 'Clinician-requested tests with results kept in your record.' },
  { icon: 'Pill', title: 'Pharmacy & Prescriptions', text: 'Collect prescribed medicines and manage prescriptions in one place.' },
  { icon: 'ScanLine', title: 'Medical Imaging & Radiology', text: 'Imaging services ordered by your care team.' },
  { icon: 'BedDouble', title: 'Inpatient Wards & Private Rooms', text: 'Comfortable ward and private-room care when you need to stay with us.' },
  { icon: 'Stethoscope', title: 'Specialist Care', text: 'Access specialists across supported clinical departments.' },
];

export const HOME_SERVICES = [
  { icon: 'HouseHeart', title: 'Home Patient Nursing', text: 'Professional nursing support delivered in the comfort of your home.' },
  { icon: 'Syringe', title: 'Home Medical Treatments', text: 'Selected treatments administered at home where clinically appropriate.' },
  { icon: 'Stethoscope', title: 'Home Consultations', text: 'Clinician consultations for patients who need care at home.' },
  { icon: 'ClipboardCheck', title: 'Home Patient Assessments', text: 'Structured health assessments to guide care decisions.' },
  { icon: 'FlaskConical', title: 'Home Sample Collection', text: 'Convenient sample collection for supported laboratory services.' },
  { icon: 'CalendarClock', title: 'Follow-up Visits', text: 'Scheduled follow-up care to support recovery and continuity.' },
];

export const OUTREACH_SERVICES = [
  { icon: 'School', title: 'School Medical Outreach', text: 'Health programmes designed for schools and learning institutions.' },
  { icon: 'ClipboardList', title: 'Institutional Health Assessments', text: 'Structured assessments for organizations and their communities.' },
  { icon: 'BookHeart', title: 'School Health Education', text: 'Practical health education sessions for students and staff.' },
  { icon: 'Users', title: 'Student Health Screening', text: 'Age-appropriate screening programmes for students.' },
  { icon: 'Building2', title: 'Staff & Employee Screening', text: 'Workplace medical screening for employees and teams.' },
  { icon: 'BriefcaseMedical', title: 'Workplace Health Assessments', text: 'Health assessments tailored to organizational needs.' },
  { icon: 'HeartHandshake', title: 'Institutional Wellness Programmes', text: 'Ongoing wellness initiatives for schools and organizations.' },
  { icon: 'Megaphone', title: 'Preventive Healthcare Campaigns', text: 'Community and institutional campaigns promoting preventive care.' },
];

export const LANDING_SERVICES = [...FEATURED_SERVICES];

export const SCREENING_SERVICES = [
  { icon: 'Activity', title: 'General Health Assessments', text: 'Baseline wellness checks to understand your health status.' },
  { icon: 'HeartPulse', title: 'Blood Pressure Screening', text: 'Quick checks to monitor and manage cardiovascular risk.' },
  { icon: 'Droplet', title: 'Blood Glucose Screening', text: 'Screening support for glucose monitoring and early awareness.' },
  { icon: 'ShieldCheck', title: 'Basic Wellness Assessments', text: 'Preventive wellness reviews for individuals and groups.' },
  { icon: 'Building2', title: 'Corporate & Institutional Screening', text: 'On-site screening campaigns for organizations and schools.' },
  { icon: 'Users', title: 'Community Screening Initiatives', text: 'Community-focused preventive health screening programmes.' },
];
