import { Link } from 'react-router-dom';
import './InformationalPage.css';

const faqs = [
  {
    question: 'How do I report a tree issue or app problem?',
    answer: 'Use the contact form and include as much detail as possible, including the tree ID, page URL, and screenshots when available.',
  },
  {
    question: 'Can I upload photos from my phone?',
    answer: 'Yes. ArborTag accepts supported image formats and may review public uploads before they are displayed broadly.',
  },
  {
    question: 'Who is ArborTag built for?',
    answer: 'ArborTag supports public parks, municipalities, schools, botanical gardens, homeowners, and pilot partners managing living assets.',
  },
  {
    question: 'Does ArborTag provide certified arborist advice?',
    answer: 'No. ArborTag provides documentation and informational tools only. Safety and maintenance decisions remain with the property owner or municipality.',
  },
];

export default function HelpFaq() {
  return (
    <main className="info-page">
      <div className="info-shell">
        <section className="info-hero">
          <p className="info-kicker">Support</p>
          <h1>Help / FAQ</h1>
          <p className="info-lead">
            Quick answers for common ArborTag questions. If your question is specific to a tree record, upload, or billing issue,
            contact support directly so we can respond with context.
          </p>
          <div className="info-actions">
            <Link className="btn btn-primary" to="/contact">Contact Support</Link>
            <Link className="btn btn-secondary" to="/contact?subject=Issue%20Report">Report an Issue</Link>
          </div>
        </section>

        {faqs.map((item) => (
          <section key={item.question} className="info-card">
            <h2>{item.question}</h2>
            <p>{item.answer}</p>
          </section>
        ))}
      </div>
    </main>
  );
}