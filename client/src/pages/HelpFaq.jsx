import { Link } from 'react-router-dom';
import './InformationalPage.css';

const faqSections = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    items: [
      {
        question: 'What is ArborTag?',
        answer: 'ArborTag is a garden memory system that helps you organize plant profiles, photos, journals, layout notes, and care history in one place. Instead of starting over each season, you build a living record that helps you remember what happened, what worked, and what to do next.',
      },
      {
        question: "What is Homeowner's Edition?",
        answer: 'Homeowner\'s Edition is ArborTag for personal gardens. It gives homeowners a private Digital Garden where Garden Companion can use your records for whole-garden memory and planning, and Plant Diagnostics can analyze individual plant health photos.',
      },
      {
        question: 'Is ArborTag free?',
        answer: 'ArborTag offers a free way to explore the experience through the Demo Garden. Homeowner account features can include tier-based limits or expanded options as the platform evolves. The easiest way to evaluate fit is to use the demo first, then choose the account level that matches your garden size and workflow.',
      },
      {
        question: 'How do I create my first garden?',
        answer: 'Start by creating a Homeowner account, then open your Digital Garden and create your first plant profile. Add the plant name, species, and location first, then upload a current photo and a short note. Even a simple first entry gives Garden Companion usable context for future planning.',
      },
      {
        question: 'How many gardens can I create?',
        answer: 'Most homeowners begin with one Digital Garden. If your account tier supports additional gardens, ArborTag will show those options in your account area. If you are unsure, check your account dashboard first or contact support for your current limit details.',
      },
      {
        question: 'How many plants can I track?',
        answer: 'Plant limits depend on your active Homeowner tier. Your dashboard shows both current usage and remaining capacity so you can track available profile slots. This makes it easy to decide when to archive old records or upgrade for more active plants.',
      },
    ],
  },
  {
    id: 'garden-companion',
    title: 'Garden Companion',
    items: [
      {
        question: 'What is Garden Companion?',
        answer: 'Garden Companion is ArborTag\'s whole-garden memory and planning assistant. It uses your saved context across profiles, notes, journals, photos, and layout details to help with routines, reminders, and next steps. Think of it as continuity for your garden decisions, not just one-time Q and A.',
      },
      {
        question: 'What makes Garden Companion different from ChatGPT?',
        answer: 'ChatGPT gives general gardening answers. Garden Companion works from your own records inside ArborTag, including plant profiles, journals, photos, layout notes, and documented events. That means recommendations can reflect your specific garden history instead of only generic best practices.',
      },
      {
        question: 'What information does Garden Companion remember?',
        answer: 'Garden Companion remembers information you record in ArborTag, such as plant profiles, growing locations, journals, photos, layout notes, and documented chat notes.',
      },
      {
        question: 'Can Garden Companion summarize my garden?',
        answer: 'Yes. Garden Companion can summarize your garden using the records currently saved, including profile totals, species diversity, locations, journal activity, and photo history. This is useful for quick check-ins before weekly care tasks, monthly planning, or seasonal transitions.',
      },
      {
        question: 'Can Garden Companion help me plan next season?',
        answer: 'Yes. You can ask for season planning support such as pruning timelines, rotation ideas, reminder schedules, and preparation checklists based on your existing garden records.',
      },
      {
        question: 'Does Garden Companion learn from my journals and photos?',
        answer: 'Garden Companion uses your saved journals and photos as context for future guidance. It can reference patterns over time, like repeated stress signals or timing changes between seasons. It does not replace your judgment, but it helps you make decisions with better memory of what happened before.',
      },
    ],
  },
  {
    id: 'plant-diagnostics',
    title: 'Plant Diagnostics',
    items: [
      {
        question: 'What is Plant Diagnostics?',
        answer: 'Plant Diagnostics is ArborTag\'s individual plant health analysis tool. It reviews one plant at a time using photos and profile context to suggest possible stress factors, care checks, and practical next actions. Use it when you need focused help on a specific issue.',
      },
      {
        question: 'How is it different from Garden Companion?',
        answer: 'Plant Diagnostics focuses on one plant at a time. Garden Companion focuses on whole-garden memory and planning across all your records.',
      },
      {
        question: 'How do I upload photos?',
        answer: 'Open a plant profile and use the photo upload button. You can add current images over time so your records show visual progress and changes.',
      },
      {
        question: 'How accurate are AI diagnostics?',
        answer: 'AI diagnostics are helpful but not perfect. Treat results as decision support, not a final diagnosis. Always confirm with direct observation, local growing conditions, and professional input when issues are severe, spreading quickly, or safety-related.',
      },
      {
        question: 'Can ArborAI identify diseases?',
        answer: 'ArborAI can suggest likely disease patterns from symptoms in photos and records, and can help you decide what to inspect next. It does not provide guaranteed diagnosis or licensed medical/agronomic certification, so confirm uncertain cases before treatment.',
      },
      {
        question: 'Can it detect insects and pests?',
        answer: 'ArborAI can flag possible pest activity and common warning signs such as leaf damage patterns, spotting, or visible clusters. Follow-up inspection is still important before treatment decisions, especially when beneficial insects could be mistaken for pests.',
      },
    ],
  },
  {
    id: 'garden-layout',
    title: 'Garden Layout',
    items: [
      {
        question: 'What is Garden Layout?',
        answer: 'Garden Layout stores your map, sketch, or zone notes so ArborTag can keep spatial context with your plant records.',
      },
      {
        question: 'Why should I upload my garden layout?',
        answer: 'A layout helps you remember where plants are, compare sun or shade areas, and make planning conversations with Garden Companion more specific.',
      },
      {
        question: 'Can I upload a hand-drawn sketch?',
        answer: 'Yes. A clear hand-drawn photo or simple map image is useful. ArborTag does not require a professional landscape plan format.',
      },
      {
        question: 'How does Garden Companion use my layout?',
        answer: 'Garden Companion uses layout context to support zone-aware planning, reminders, and organization. For example, it can help you think in terms of beds, containers, shade zones, and watering patterns. Your uploaded layout and notes remain the source of truth for location decisions.',
      },
      {
        question: 'Can I update my layout later?',
        answer: 'Yes. You can upload updated layout images and notes whenever your beds, containers, or planting zones change.',
      },
    ],
  },
  {
    id: 'journals-history',
    title: 'Journals & History',
    items: [
      {
        question: 'Why should I keep a garden journal?',
        answer: 'A journal turns daily observations into long-term memory. It helps you track what worked, what failed, and what changed each season.',
      },
      {
        question: 'What should I record?',
        answer: 'Record practical facts: watering dates, fertilizer timing, pruning, pest events, weather stress, transplanting, and harvest notes.',
      },
      {
        question: 'Can I record watering, fertilizing, pruning and harvesting?',
        answer: 'Yes. ArborTag is designed for that routine history so your care timeline stays in one place and is easy to review.',
      },
      {
        question: 'Can I keep general garden notes?',
        answer: 'Yes. You can keep both plant-specific notes and broader garden notes about season plans, observations, and reminders.',
      },
      {
        question: 'How does ArborAI use my history?',
        answer: 'ArborAI uses your saved history to make guidance more contextual. It can reference your timeline so recommendations connect to prior watering, feeding, pruning, weather stress, and observed outcomes. This helps reduce repeated guesswork and makes care plans easier to trust over time.',
      },
    ],
  },
  {
    id: 'photos',
    title: 'Photos',
    items: [
      {
        question: 'Can I upload photos anytime?',
        answer: 'Yes. You can upload photos whenever you have a new observation, issue, milestone, or seasonal check-in.',
      },
      {
        question: 'Does ArborTag organize my photos?',
        answer: 'Yes. Photos stay attached to plant profiles so they remain linked with plant names, notes, dates, and care history. That structure makes it easier to review changes and keeps visual evidence connected to the actions you took.',
      },
      {
        question: 'Can I compare plant growth over time?',
        answer: 'Yes. As you upload photos over time, you can review visual progression and compare changes across the season. This is especially useful for tracking recovery, growth rate, pruning response, and recurring stress signals.',
      },
    ],
  },
  {
    id: 'qr-tags',
    title: 'QR Tags',
    items: [
      {
        question: 'Do I need QR tags?',
        answer: 'No. QR tags are optional. ArborTag works without them, especially for homeowners managing their own Digital Garden.',
      },
      {
        question: 'Can I use ArborTag without QR tags?',
        answer: 'Yes. You can create and manage profiles, upload photos, and use Garden Companion without any physical tags.',
      },
      {
        question: 'What happens when I scan a QR tag?',
        answer: 'A scan opens the linked plant record so you can view information quickly, update details, and keep records current.',
      },
    ],
  },
  {
    id: 'privacy',
    title: 'Privacy',
    items: [
      {
        question: 'Is my garden private?',
        answer: 'Yes. Homeowner garden records are intended to remain private to the account owner unless you explicitly share information through ArborTag features. ArborTag is designed so your personal notes, journals, and photos support your own planning workflow.',
      },
      {
        question: 'Who owns my data?',
        answer: 'You retain ownership of your garden records. ArborTag provides the tools to store, organize, and process that information so features like Garden Companion and Plant Diagnostics can work within your account experience.',
      },
      {
        question: 'Does ArborAI share my information?',
        answer: 'ArborAI uses your data to provide guidance inside the product experience. It is not designed to publish your private records for public browsing. If you have a sensitive-use question, contact support and request clarification for your specific workflow.',
      },
      {
        question: 'Can I delete my garden?',
        answer: 'If you need account or data deletion, contact support and include your account email so the team can verify and process your request. Include what you want removed, such as a specific garden, profile history, or full account data, so processing is faster.',
      },
    ],
  },
  {
    id: 'general',
    title: 'General',
    items: [
      {
        question: 'Why not just use ChatGPT?',
        answer: 'ChatGPT is useful for general gardening information. ArborTag is different because it stores your own garden memory, then Garden Companion uses that memory for context-aware planning and guidance.',
      },
      {
        question: 'What makes ArborTag different from other gardening apps?',
        answer: 'ArborTag combines records, journals, photos, layout context, Plant Diagnostics, and Garden Companion in one memory-centered workflow.',
      },
      {
        question: 'Can I export my information?',
        answer: 'Export options may vary by account type and feature rollout. If you need a specific export for reporting, migration, or backup, contact ArborTag support and describe exactly what data you need, such as profile records, journals, photos, or timeline history.',
      },
      {
        question: 'How often should I update my garden?',
        answer: 'A light weekly update works well for most gardeners, with extra entries during weather shifts, visible stress events, or major seasonal transitions. Short, consistent notes are usually better than long occasional entries because they create cleaner history for future decisions.',
      },
      {
        question: 'Is ArborTag replacing my notebook?',
        answer: 'ArborTag can replace paper notes for many gardeners, but it can also work alongside your notebook. The goal is not to force one method, it is to keep records consistent enough that your garden history stays useful and searchable.',
      },
    ],
  },
];

function buildFaqStructuredData() {
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://arbordex.onrender.com';
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqSections.flatMap((section) =>
      section.items.map((item) => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: item.answer,
        },
        url: `${baseUrl}/help#${section.id}`,
      })),
    ),
  };
}

export default function HelpFaq() {
  const faqStructuredData = buildFaqStructuredData();

  return (
    <main className="info-page">
      <div className="info-shell">
        <script type="application/ld+json">{JSON.stringify(faqStructuredData)}</script>

        <section className="info-hero">
          <p className="info-kicker">Knowledge Base</p>
          <h1>Help / FAQ</h1>
          <p className="info-lead">
            ArborTag is The Memory Behind Every Garden. This page explains how Homeowner&apos;s Edition,
            Garden Companion, and Plant Diagnostics work together so your records stay useful season after season.
          </p>
          <p className="info-lead">
            New to ArborTag? Start with these links:
          </p>
          <div className="info-inline-actions">
            <Link className="info-inline-link" to="/homeowners">Homeowner&apos;s Edition</Link>
            <span aria-hidden="true">•</span>
            <Link className="info-inline-link" to="/homeowners/demo-garden">Demo Garden</Link>
          </div>

          <nav className="faq-anchor-nav" aria-label="FAQ Sections">
            {faqSections.map((section) => (
              <a key={section.id} href={`#${section.id}`} className="faq-anchor-link">
                {section.title}
              </a>
            ))}
          </nav>

          <div className="info-actions">
            <Link className="btn btn-primary" to="/contact">Contact Support</Link>
            <Link className="btn btn-secondary" to="/contact?subject=Issue%20Report">Report an Issue</Link>
          </div>
        </section>

        {faqSections.map((section) => (
          <section key={section.id} id={section.id} className="info-card faq-section">
            <h2>{section.title}</h2>
            <div className="faq-accordion" role="list">
              {section.items.map((item) => (
                <details key={item.question} className="faq-item" role="listitem">
                  <summary className="faq-question">{item.question}</summary>
                  <p className="faq-answer">{item.answer}</p>
                </details>
              ))}
            </div>
          </section>
        ))}

        <section className="info-card">
          <h2>Need More Help?</h2>
          <p>
            If your question is account-specific, include your account email, page URL, and a short issue summary in your support request.
            That helps the team respond faster with context.
          </p>
          <div className="info-actions">
            <Link className="btn btn-primary" to="/contact">Contact Support</Link>
            <Link className="btn btn-secondary" to="/homeowners/demo-garden">Open Demo Garden</Link>
            <Link className="btn btn-secondary" to="/homeowners">Open Homeowner&apos;s Edition</Link>
          </div>
        </section>
      </div>
    </main>
  );
}