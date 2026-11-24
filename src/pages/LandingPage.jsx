import React, { useEffect, useState } from 'react';
import {
  Activity, ArrowRight, Baby, BedDouble, BookHeart, BriefcaseMedical, Building2, CalendarCheck,
  CalendarClock, ClipboardCheck, ClipboardList, Droplet, FlaskConical, HeartHandshake, HeartPulse,
  HouseHeart, Mail, MapPin, Megaphone, MessageCircleQuestion, Microscope, Phone, PhoneCall, Pill,
  ScanLine, School, ShieldCheck, Stethoscope, Syringe, Users, Video, X,
} from 'lucide-react';
import {
  DIGITAL_SERVICES, FACILITY_SERVICES, FEATURED_SERVICES, HERO_IMAGE, HOME_SERVICES,
  LANDING_BRAND, LANDING_CONTACT, LANDING_NAV, MAILTO_URL, OUTREACH_SERVICES,
  SCREENING_SERVICES, TEL_URL, WHATSAPP_URL,
} from '../data/landing';

const ICONS = {
  Activity, Baby, BedDouble, BookHeart, BriefcaseMedical, Building2, CalendarCheck, CalendarClock,
  ClipboardCheck, ClipboardList, Droplet, FlaskConical, HeartHandshake, HeartPulse, HouseHeart,
  Megaphone, MessageCircleQuestion, Microscope, PhoneCall, Pill, ScanLine, School, ShieldCheck,
  Stethoscope, Syringe, Users, Video,
};

const Icon = ({ name, size = 20 }) => {
  const Cmp = ICONS[name] || Stethoscope;
  return <Cmp size={size} />;
};

const ServiceCard = ({ icon, title, text }) => (
  <article className="cp-card cp-feature">
    <span className="cp-icon-tile"><Icon name={icon} /></span>
    <h3>{title}</h3>
    <p>{text}</p>
  </article>
);

export const LandingPage = ({ onNavigateLogin, onNavigateRegister }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollToSection = (id) => {
    setMenuOpen(false);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const goRegister = () => (onNavigateRegister ? onNavigateRegister() : (window.location.href = '/register'));
  const goLogin = () => (onNavigateLogin ? onNavigateLogin() : (window.location.href = '/login'));

  return (
    <div className="cp-landing">
      <header className={`cp-header ${scrolled ? 'is-scrolled' : ''}`}>
        <div className="cp-container cp-header-inner">
          <a href="#top" className="cp-logo" onClick={(e) => { e.preventDefault(); setMenuOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
            <span className="cp-logo-mark"><Activity size={18} /></span>
            {LANDING_BRAND.name}
          </a>

          <nav className={`cp-nav ${menuOpen ? 'is-open' : ''}`} aria-label="Main">
            {LANDING_NAV.map((link) => (
              <a key={link.id} href={`#${link.id}`} onClick={(e) => { e.preventDefault(); scrollToSection(link.id); }}>{link.label}</a>
            ))}
            <div className="cp-nav-mobile-actions">
              <button type="button" className="cp-btn cp-btn-outline" onClick={goLogin}>Patient Portal</button>
              <button type="button" className="cp-btn cp-btn-primary" onClick={goRegister}>Book Appointment</button>
            </div>
          </nav>

          <div className="cp-header-actions">
            <button type="button" className="cp-btn cp-btn-ghost" onClick={() => window.location.href = '/staff/login'}>Staff Sign in</button>
            <button type="button" className="cp-btn cp-btn-outline" onClick={goLogin}>Patient Portal</button>
            <button type="button" className="cp-btn cp-btn-primary" onClick={goRegister}>Book Appointment</button>
          </div>

          <button type="button" className="cp-menu-toggle" aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)}>
            {menuOpen ? <X size={22} /> : <MapPin size={22} />}
          </button>
        </div>
      </header>

      <main id="top">
        <section className="cp-hero cp-hero-modern">
          <div className="cp-hero-bg" aria-hidden="true" style={{ backgroundImage: `url('${HERO_IMAGE}')` }} />
          <div className="cp-hero-overlay cp-hero-overlay-blue" aria-hidden="true" />
          <div className="cp-container cp-hero-modern-inner">
            <div className="cp-hero-copy cp-hero-copy-modern">
              <span className="cp-eyebrow cp-eyebrow-light">Fidus Medical Center · Bugembegembe Wakiso</span>
              <h1>Healthcare, Connected to You.</h1>
              <p className="cp-hero-sub">
                Access quality healthcare through convenient appointments, virtual consultations, medical guidance and personalized healthcare services, wherever you are.
              </p>
              <div className="cp-hero-ctas">
                <button type="button" className="cp-btn cp-btn-primary cp-btn-lg" onClick={goRegister}>Book an Appointment <ArrowRight size={18} /></button>
                <button type="button" className="cp-btn cp-btn-outline cp-btn-lg cp-btn-glass" onClick={goLogin}>Access Patient Portal</button>
                <button type="button" className="cp-btn cp-btn-ghost cp-btn-lg cp-btn-glass-ghost" onClick={() => scrollToSection('contact')}>Talk to a Medical Professional</button>
              </div>
              <div className="cp-hero-trust">
                <span><ShieldCheck size={16} /> Secure patient access</span>
                <span><Video size={16} /> Virtual care available</span>
                <span><HouseHeart size={16} /> Care beyond the facility</span>
              </div>
            </div>
          </div>
        </section>

        <section id="about" className="cp-section">
          <div className="cp-container cp-about-grid">
            <div>
              <span className="cp-eyebrow">About Fidus</span>
              <h2 className="cp-section-title-lg">A modern medical center built around connected care.</h2>
              <p className="cp-section-lead">
                Fidus Medical Center combines compassionate in-person care with digital healthcare services. Patients can book appointments, access virtual consultations, request home care and stay connected to their health journey through one secure platform.
              </p>
            </div>
            <div className="cp-about-points">
              <div className="cp-about-point"><CalendarCheck size={18} /><div><strong>Convenient access</strong><span>Book and manage care from anywhere.</span></div></div>
              <div className="cp-about-point"><Video size={18} /><div><strong>Digital consultations</strong><span>Reach professionals through telemedicine where appropriate.</span></div></div>
              <div className="cp-about-point"><HouseHeart size={18} /><div><strong>Care beyond the premises</strong><span>Home and institutional healthcare services when you need them.</span></div></div>
            </div>
          </div>
        </section>

        <section id="services" className="cp-section cp-section-tint">
          <div className="cp-container">
            <div className="cp-section-head">
              <span className="cp-eyebrow">Featured Services</span>
              <h2>Healthcare services designed for real life</h2>
              <p>Explore the core ways Fidus delivers care — digitally, at the facility, at home and in the community.</p>
            </div>
            <div className="cp-feature-grid cp-feature-grid-4">
              {FEATURED_SERVICES.map((s) => <ServiceCard key={s.title} {...s} />)}
            </div>
          </div>
        </section>

        <section className="cp-section">
          <div className="cp-container">
            <div className="cp-section-head cp-left">
              <span className="cp-eyebrow">Digital Healthcare</span>
              <h2>Connected services, wherever you are</h2>
              <p>Use the Fidus platform to access care, guidance and follow-up without unnecessary friction.</p>
            </div>
            <div className="cp-feature-grid cp-feature-grid-3">{DIGITAL_SERVICES.map((s) => <ServiceCard key={s.title} {...s} />)}</div>
          </div>
        </section>

        <section className="cp-section cp-section-tint">
          <div className="cp-container">
            <div className="cp-section-head cp-left">
              <span className="cp-eyebrow">Facility-Based Care</span>
              <h2>Trusted clinical services at Fidus Medical Center</h2>
              <p>Our facility continues to provide the medical services patients rely on, delivered with compassion and professionalism.</p>
            </div>
            <div className="cp-feature-grid cp-feature-grid-4">{FACILITY_SERVICES.map((s) => <ServiceCard key={s.title} {...s} />)}</div>
          </div>
        </section>

        <section className="cp-section">
          <div className="cp-container">
            <div className="cp-split-panel">
              <div>
                <span className="cp-eyebrow">Mobile & Home Healthcare</span>
                <h2 className="cp-section-title-lg">Quality care, delivered beyond our premises.</h2>
                <p className="cp-section-lead">Fidus extends healthcare to where patients are. Request home-based services for nursing, assessments, consultations, sample collection and follow-up care.</p>
                <div className="cp-inline-actions">
                  <button type="button" className="cp-btn cp-btn-primary" onClick={goRegister}>Request Home Care <ArrowRight size={16} /></button>
                  <button type="button" className="cp-btn cp-btn-outline" onClick={() => scrollToSection('contact')}>Talk to Our Team</button>
                </div>
              </div>
              <div className="cp-feature-grid cp-feature-grid-2">{HOME_SERVICES.map((s) => <ServiceCard key={s.title} {...s} />)}</div>
            </div>
          </div>
        </section>

        <section id="programmes" className="cp-section cp-section-tint">
          <div className="cp-container">
            <div className="cp-section-head">
              <span className="cp-eyebrow">Outreach & Preventive Care</span>
              <h2>Healthcare programmes for schools, organizations and communities</h2>
              <p>Fidus supports preventive and institutional healthcare through outreach, screening and customized wellness programmes.</p>
            </div>

            <div className="cp-programme-block">
              <div className="cp-programme-head">
                <div><span className="cp-eyebrow">Institutional Outreach</span><h3>School and institutional healthcare outreach</h3></div>
                <button type="button" className="cp-btn cp-btn-outline" onClick={() => scrollToSection('contact')}>Request Outreach Programme</button>
              </div>
              <div className="cp-feature-grid cp-feature-grid-4">{OUTREACH_SERVICES.map((s) => <ServiceCard key={s.title} {...s} />)}</div>
            </div>

            <div className="cp-programme-block">
              <div className="cp-programme-head">
                <div><span className="cp-eyebrow">Health Screening</span><h3>Preventive screening for individuals and groups</h3></div>
                <button type="button" className="cp-btn cp-btn-primary" onClick={goRegister}>Book Screening <ArrowRight size={16} /></button>
              </div>
              <div className="cp-feature-grid cp-feature-grid-3">{SCREENING_SERVICES.map((s) => <ServiceCard key={s.title} {...s} />)}</div>
              <p className="cp-disclaimer">Screening services are provided based on facility capability and clinical appropriateness. Contact Fidus Medical Center for available tests and programme details.</p>
            </div>
          </div>
        </section>

        <section className="cp-section">
          <div className="cp-container">
            <div className="cp-cta-banner">
              <div>
                <span className="cp-eyebrow">Get Started</span>
                <h2>Ready to access connected healthcare?</h2>
                <p>Create a patient account to book appointments, request home care, or enquire about screening and outreach programmes.</p>
              </div>
              <div className="cp-cta-banner-actions">
                <button type="button" className="cp-btn cp-btn-primary cp-btn-lg" onClick={goRegister}>Create Patient Account</button>
                <button type="button" className="cp-btn cp-btn-outline cp-btn-lg" onClick={() => scrollToSection('contact')}>Contact Fidus</button>
              </div>
            </div>
          </div>
        </section>

        <section id="contact" className="cp-section cp-section-tint">
          <div className="cp-container">
            <div className="cp-section-head">
              <span className="cp-eyebrow">Contact</span>
              <h2>Visit, call or message us</h2>
              <p>Reach our team for appointments, home care requests, screening, outreach programmes or general enquiries.</p>
            </div>
            <div className="cp-contact-grid">
              <article className="cp-card cp-contact-card"><span className="cp-icon-tile"><MapPin size={20} /></span><h3>Visit us</h3><p><strong>{LANDING_BRAND.name}</strong><br />{LANDING_CONTACT.address}</p><p className="cp-contact-hint">Please contact us to confirm directions before travelling.</p></article>
              <article className="cp-card cp-contact-card"><span className="cp-icon-tile"><Phone size={20} /></span><h3>WhatsApp</h3><a href={WHATSAPP_URL(LANDING_CONTACT.whatsapp)} className="cp-contact-link cp-contact-link-lg" target="_blank" rel="noopener noreferrer">{LANDING_CONTACT.whatsappDisplay} <ArrowRight size={16} /></a><p className="cp-contact-hint">Message us for appointments and service enquiries.</p></article>
              <article className="cp-card cp-contact-card"><span className="cp-icon-tile"><Mail size={20} /></span><h3>Email</h3><a href={MAILTO_URL(LANDING_CONTACT.email)} className="cp-contact-link cp-contact-link-lg">{LANDING_CONTACT.email} <ArrowRight size={16} /></a><p className="cp-contact-hint">For non-urgent enquiries and programme requests.</p></article>
              <article className="cp-card cp-contact-card"><span className="cp-icon-tile"><PhoneCall size={20} /></span><h3>Call us</h3><a href={TEL_URL(LANDING_CONTACT.phone)} className="cp-contact-link cp-contact-link-lg">{LANDING_CONTACT.phone} <ArrowRight size={16} /></a><p className="cp-contact-hint">For appointments and general questions.</p></article>
            </div>
          </div>
        </section>
      </main>

      <footer className="cp-footer">
        <div className="cp-container cp-footer-inner">
          <span className="cp-logo cp-logo-sm"><span className="cp-logo-mark"><Activity size={14} /></span>{LANDING_BRAND.name}</span>
          <nav className="cp-footer-links" aria-label="Footer">
            {LANDING_NAV.map((l) => <a key={l.id} href={`#${l.id}`} onClick={(e) => { e.preventDefault(); scrollToSection(l.id); }}>{l.label}</a>)}
            <a href={WHATSAPP_URL(LANDING_CONTACT.whatsapp)} target="_blank" rel="noopener noreferrer">WhatsApp</a>
          </nav>
          <address className="cp-footer-contact">
            <a href={TEL_URL(LANDING_CONTACT.phone)}>{LANDING_CONTACT.phone}</a>
            <a href={MAILTO_URL(LANDING_CONTACT.email)}>{LANDING_CONTACT.email}</a>
          </address>
          <p className="cp-footer-copy">© {new Date().getFullYear()} {LANDING_BRAND.name} · {LANDING_CONTACT.address}</p>
        </div>
      </footer>
    </div>
  );
};
