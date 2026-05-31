import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { submitContactSupport } from '../api';
import './ContactSupport.css';

const defaultForm = {
  name: '',
  email: '',
  organization: '',
  subject: '',
  message: '',
};

export default function ContactSupport() {
  const location = useLocation();
  const prefilledSubject = new URLSearchParams(location.search).get('subject') || '';
  const [formData, setFormData] = useState({ ...defaultForm, subject: prefilledSubject });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitState, setSubmitState] = useState(null);

  useEffect(() => {
    setFormData((current) => ({
      ...current,
      subject: current.subject && current.subject !== prefilledSubject ? current.subject : prefilledSubject,
    }));
  }, [prefilledSubject]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    setSubmitError('');
    setSubmitState(null);

    try {
      const response = await submitContactSupport(formData);
      setSubmitState(response?.confirmationSent === false ? 'partial' : 'success');
      setFormData({ ...defaultForm, subject: prefilledSubject });
    } catch (error) {
      const message = error?.response?.data?.error || 'We could not send your message right now. Please try again.';
      setSubmitError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="contact-page">
      <div className="contact-backdrop" aria-hidden="true" />
      <section className="contact-shell">
        <div className="contact-copy">
          <p className="contact-kicker">Support</p>
          <h1>Contact ArborTag support</h1>
          <p className="contact-lead">
            Send a question, issue report, or partnership request and we will route it to the ArborTag support inbox.
          </p>

          {prefilledSubject ? (
            <p className="contact-prefill-note">This page was opened with a suggested subject: {prefilledSubject}</p>
          ) : null}

          <div className="contact-direct-card">
            <p className="contact-direct-label">Direct inbox</p>
            <a href="mailto:arbortag_support@rrtech.dev">arbortag_support@rrtech.dev</a>
            <p>
              After you submit this form, this system will forward your message to support and send a confirmation email back to you.
            </p>
          </div>
        </div>

        <form className="contact-form-card" onSubmit={handleSubmit} noValidate>
          <div className="contact-form-grid">
            <label className="contact-field">
              <span>Name</span>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                autoComplete="name"
                required
              />
            </label>

            <label className="contact-field">
              <span>Email</span>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                autoComplete="email"
                required
              />
            </label>

            <label className="contact-field contact-field-wide">
              <span>Organization / city / park name</span>
              <input
                type="text"
                name="organization"
                value={formData.organization}
                onChange={handleChange}
                autoComplete="organization"
              />
            </label>

            <label className="contact-field contact-field-wide">
              <span>Subject</span>
              <input
                type="text"
                name="subject"
                value={formData.subject}
                onChange={handleChange}
                required
              />
            </label>

            <label className="contact-field contact-field-wide">
              <span>Message</span>
              <textarea
                name="message"
                value={formData.message}
                onChange={handleChange}
                rows="7"
                required
              />
            </label>
          </div>

          {submitError ? <p className="contact-status contact-status-error">{submitError}</p> : null}
          {submitState === 'success' ? (
            <p className="contact-status contact-status-success">
              Your message was sent. Check your inbox for the ArborTag support confirmation email.
            </p>
          ) : null}
          {submitState === 'partial' ? (
            <p className="contact-status contact-status-warning">
              Your message was sent to support, but the confirmation email could not be delivered automatically.
            </p>
          ) : null}

          <button className="contact-submit" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Sending...' : 'Submit'}
          </button>
        </form>
      </section>
    </main>
  );
}