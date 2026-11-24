import React, { useEffect, useRef, useState } from 'react';
import {
  CalendarCheck,
  HeartPulse,
  MapPin,
  MessageCircleHeart,
  Phone,
  Send,
  Stethoscope,
  X,
} from 'lucide-react';
import { LANDING_BRAND, LANDING_CONTACT, LANDING_SERVICES } from '../../data/landing';
import { chatbotService } from '../../services/api';

const WELCOME =
  'Hello! Welcome to Fidus Medical Center. How can we help you today?';

const QUICK_ACTIONS = [
  { id: 'services', label: 'Services', icon: Stethoscope },
  { id: 'book', label: 'Book an Appointment', icon: CalendarCheck },
  { id: 'location', label: 'Location', icon: MapPin },
  { id: 'contact', label: 'Contact', icon: Phone },
];

const CALL_LINK = LANDING_CONTACT.phone;
const WHATSAPP_DISPLAY = LANDING_CONTACT.whatsappDisplay;
const EMAIL = LANDING_CONTACT.email;
const ADDRESS = LANDING_CONTACT.address;

const listServices = () => LANDING_SERVICES.map((s) => `• ${s.title}`).join('\n');

const getAssistantReply = (rawQuery) => {
  const q = rawQuery.toLowerCase();

  if (/(emergency|urgent|bleeding|bleed|chest pain|can.t breathe|breathless|unconscious)/.test(q)) {
    return {
      text: `I cannot help with emergencies. If this is an emergency, call ${CALL_LINK} now or go to the nearest emergency department.`,
      tone: 'urgent',
    };
  }

  if (/(service|services|treat|offer|department|departments|specialist|special)/.test(q)) {
    return {
      text: `Our services include:\n${listServices()}\n\nIf you are unsure which service you need, call ${CALL_LINK} and our team will guide you.`,
    };
  }

  if (/(book|appointment|schedule|see a doctor|visit)/.test(q)) {
    return {
      text: `You can book an appointment by creating a patient account on this website. If you would rather speak to someone, call ${CALL_LINK} or message us on WhatsApp at ${WHATSAPP_DISPLAY}.`,
      action: 'book',
    };
  }

  if (/(where|location|address|direction|find you|located|map)/.test(q)) {
    return {
      text: `${LANDING_BRAND.name} is in ${ADDRESS}. Please call ${CALL_LINK} or message ${WHATSAPP_DISPLAY} to confirm directions before travelling.`,
    };
  }

  if (/(phone|call|contact|whatsapp|email|number|reach)/.test(q)) {
    return {
      text: `You can reach us by phone on ${CALL_LINK}, on WhatsApp at ${WHATSAPP_DISPLAY}, or by email at ${EMAIL}.`,
    };
  }

  if (/(hour|hours|open|opening|close|closing|time)/.test(q)) {
    return {
      text: `Please call ${CALL_LINK} or message ${WHATSAPP_DISPLAY} to confirm our current opening hours before your visit.`,
    };
  }

  if (/(doctor|cardiolog|neurolog|pediatric|orthoped|clinician|nurse|midwife)/.test(q)) {
    return {
      text: 'Our care team includes specialists in cardiology, neurology, pediatrics and orthopedics, as well as nursing and maternity support. Please call us to confirm availability and appointment times.',
    };
  }

  if (/(medicine|medication|prescription|pharmacy|drug|dose)/.test(q)) {
    return {
      text: 'For prescription or medicine questions, please speak to our pharmacy team by phone or WhatsApp. I am an information assistant and cannot give medical advice or prescribe medication.',
    };
  }

  if (/(symptom|diagnos|sick|fever|cough|pain|test result|result)/.test(q)) {
    return {
      text: 'I am an information assistant and cannot diagnose conditions or interpret test results. Please book an appointment or call us so a healthcare professional can help you.',
    };
  }

  return {
    text: `I can help with services, appointments, location and contact details. For anything else, call ${CALL_LINK} or message us on WhatsApp at ${WHATSAPP_DISPLAY}.`,
  };
};

export const PatientChatBot = ({ onBookAppointment }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([{ role: 'assistant', text: WELCOME }]);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  const sendMessage = async (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const userMsg = { role: 'user', text: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    try {
      const res = await chatbotService.sendMessage({ message: trimmed, history: messages.slice(-8) });
      const reply = res?.reply || res?.data?.reply || getAssistantReply(trimmed).text;
      const local = getAssistantReply(trimmed);
      setMessages((prev) => [...prev, { role: 'assistant', text: reply, action: local.action, tone: local.tone }]);
    } catch {
      const local = getAssistantReply(trimmed);
      setMessages((prev) => [...prev, { role: 'assistant', text: local.text, action: local.action, tone: local.tone }]);
    }
  };

  const handleQuickAction = (id) => {
    const labels = {
      services: 'Services',
      book: 'Book an Appointment',
      location: 'Location',
      contact: 'Contact',
    };
    sendMessage(labels[id]);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    sendMessage(input);
  };

  return (
    <div className="fidus-chat">
      {isOpen && (
        <div
          className="fidus-chat-panel"
          id="fidus-chat-panel"
          role="dialog"
          aria-label="Chat with Fidus Medical Center"
          ref={panelRef}
        >
          <div className="fidus-chat-header">
            <div className="fidus-chat-title-wrap">
              <span className="fidus-chat-header-icon" aria-hidden="true">
                <HeartPulse size={18} />
              </span>
              <div>
                <div className="fidus-chat-title">Chat with Fidus</div>
                <div className="fidus-chat-status">Automated information assistant</div>
              </div>
            </div>
            <button
              type="button"
              className="fidus-chat-close"
              onClick={() => setIsOpen(false)}
              aria-label="Close chat"
            >
              <X size={18} />
            </button>
          </div>

          <div className="fidus-chat-messages" role="log" aria-live="polite" aria-relevant="additions">
            {messages.map((m, idx) => (
              <div key={idx} className={`fidus-chat-msg ${m.role === 'user' ? 'is-user' : 'is-assistant'}`}>
                <div className={`fidus-chat-bubble ${m.tone === 'urgent' ? 'is-urgent' : ''}`}>
                  {m.text.split('\n').map((line, i) => (
                    <p key={i}>{line}</p>
                  ))}
                  {m.action === 'book' && (
                    <button
                      type="button"
                      className="cp-btn cp-btn-primary cp-btn-sm fidus-chat-action"
                      onClick={() => {
                        setIsOpen(false);
                        if (onBookAppointment) onBookAppointment();
                      }}
                    >
                      Create a patient account
                    </button>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <div className="fidus-chat-quick" aria-label="Quick actions">
            {QUICK_ACTIONS.map(({ id, label, icon: Icon }) => (
              <button key={id} type="button" className="fidus-chat-chip" onClick={() => handleQuickAction(id)}>
                <Icon size={14} aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>

          <form className="fidus-chat-input-row" onSubmit={handleSubmit}>
            <label className="sr-only" htmlFor="fidus-chat-input">
              Type your message
            </label>
            <input
              id="fidus-chat-input"
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your message…"
              autoComplete="off"
            />
            <button type="submit" className="fidus-chat-send" aria-label="Send message" disabled={!input.trim()}>
              <Send size={16} />
            </button>
          </form>

          <p className="fidus-chat-disclaimer">
            This assistant shares general information only. It does not provide medical advice,
            diagnosis or prescriptions. For emergencies, call {CALL_LINK} or go to the nearest
            emergency department.
          </p>
        </div>
      )}

      <button
        type="button"
        className="fidus-chat-fab"
        onClick={() => setIsOpen((v) => !v)}
        aria-label={isOpen ? 'Close chat with Fidus' : 'Chat with Fidus'}
        aria-expanded={isOpen}
        aria-controls="fidus-chat-panel"
      >
        {isOpen ? <X size={24} /> : <MessageCircleHeart size={26} />}
        {!isOpen && <span className="fidus-chat-fab-badge" aria-hidden="true" />}
      </button>
    </div>
  );
};
