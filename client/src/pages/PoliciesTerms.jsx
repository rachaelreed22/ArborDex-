import { useNavigate } from 'react-router-dom';
import './PoliciesTerms.css';

export default function PoliciesTerms() {
  const navigate = useNavigate();

  return (
    <div className="policies-page">
      <div className="policies-container">
        <div className="policies-header">
          <h1>🌿 ArborTag Policies &amp; Terms</h1>
          <p className="policies-subheading">
            Please read all three sections carefully before using ArborTag.
          </p>
          <button className="btn btn-secondary policies-back-btn" onClick={() => navigate('/staff/login')}>
            ← Back to Login
          </button>
        </div>

        {/* ── PRIVACY POLICY ── */}
        <section className="policies-card">
          <h2>🌿 Privacy Policy</h2>
          <p className="policies-meta">Last updated: May 21, 2026</p>

          <div className="policies-section">
            <h3>1. Overview</h3>
            <p>
              ArborTag ("we," "our," "the Service") is a tree and plant information management platform
              designed for homeowners, gardeners, landowners, and municipalities. We are committed to
              protecting your privacy and handling your data responsibly.
            </p>
            <p>This Privacy Policy explains what information we collect, how we use it, and the choices you have.</p>
          </div>

          <div className="policies-section">
            <h3>2. Information We Collect</h3>

            <h4>A. Information You Provide</h4>
            <ul>
              <li>Account information (name, email, password)</li>
              <li>Plant or tree data you enter</li>
              <li>Photos you upload</li>
              <li>Notes, logs, and maintenance records</li>
              <li>Location information you manually add</li>
            </ul>

            <h4>B. Automatically Collected Information</h4>
            <ul>
              <li>Device type</li>
              <li>Browser type</li>
              <li>IP address</li>
              <li>Usage analytics (pages visited, features used)</li>
            </ul>

            <h4>C. Municipal Accounts Only</h4>
            <ul>
              <li>Tree ID numbers</li>
              <li>Hazard notes</li>
              <li>Maintenance logs</li>
              <li>Staff user accounts</li>
              <li>Public works or parks department data</li>
            </ul>

            <p><strong>We do not collect:</strong></p>
            <ul>
              <li>Social Security numbers</li>
              <li>Financial account numbers</li>
              <li>Sensitive personal information</li>
            </ul>
          </div>

          <div className="policies-section">
            <h3>3. How We Use Your Information</h3>
            <p>We use your information to:</p>
            <ul>
              <li>Provide and improve the ArborTag service</li>
              <li>Sync your plant/tree data across devices</li>
              <li>Generate reminders and care suggestions</li>
              <li>Improve AI accuracy</li>
              <li>Provide customer support</li>
              <li>Maintain system security</li>
              <li>Analyze usage trends</li>
            </ul>
            <p className="policies-highlight">We do not sell your personal information.</p>
          </div>

          <div className="policies-section">
            <h3>4. How Your Data Is Stored</h3>
            <ul>
              <li>Data is stored securely using industry-standard encryption.</li>
              <li>Backups are encrypted.</li>
              <li>Access is restricted to authorized personnel only.</li>
              <li>Municipal data is stored in separate, access-controlled environments.</li>
            </ul>
          </div>

          <div className="policies-section">
            <h3>5. Sharing of Information</h3>
            <p>We may share data only in the following cases:</p>
            <ul>
              <li>With your explicit permission</li>
              <li>With service providers who help operate ArborTag (hosting, analytics)</li>
              <li>When required by law (court order, subpoena)</li>
            </ul>
            <p className="policies-highlight">We never sell or rent your data to third parties.</p>
          </div>

          <div className="policies-section">
            <h3>6. Data Ownership</h3>
            <p>You own the data you enter into ArborTag. You may request:</p>
            <ul>
              <li>Data export</li>
              <li>Data deletion</li>
              <li>Account deletion</li>
            </ul>
            <p>Municipal accounts must follow their own internal data retention policies.</p>
          </div>

          <div className="policies-section">
            <h3>7. Children's Privacy</h3>
            <p>ArborTag is not intended for children under 13.</p>
          </div>

          <div className="policies-section">
            <h3>8. Changes to This Policy</h3>
            <p>
              We may update this Privacy Policy periodically. Updates will be posted in the app and on our website.
            </p>
          </div>

          <div className="policies-section">
            <h3>9. Contact</h3>
            <p>For privacy questions or requests: <a href="mailto:rachaelr@rrtech.dev">rachaelr@rrtech.dev</a></p>
          </div>
        </section>

        {/* ── LEGAL DISCLAIMER ── */}
        <section className="policies-card">
          <h2>🌿 Legal Obligations &amp; Liability Disclaimer</h2>
          <p className="policies-meta">Last updated: May 21, 2026</p>

          <div className="policies-section">
            <h3>1. Informational Use Only</h3>
            <p>
              ArborTag provides informational, organizational, and educational tools for tracking plants
              and trees. ArborTag does not provide:
            </p>
            <ul>
              <li>Certified arborist evaluations</li>
              <li>Professional hazard assessments</li>
              <li>Legal risk assessments</li>
              <li>Emergency response recommendations</li>
              <li>Guarantees of tree stability or safety</li>
            </ul>
            <p>
              All maintenance, safety, and risk decisions remain the responsibility of the property owner
              or municipality.
            </p>
          </div>

          <div className="policies-section">
            <h3>2. No Professional Advice</h3>
            <p>ArborTag is not a substitute for:</p>
            <ul>
              <li>A certified arborist</li>
              <li>A tree risk assessment</li>
              <li>Municipal safety inspections</li>
              <li>Legal or insurance guidance</li>
            </ul>
            <p>Any AI-generated suggestions are informational only.</p>
          </div>

          <div className="policies-section">
            <h3>3. User Responsibility</h3>
            <p>Users are solely responsible for:</p>
            <ul>
              <li>Inspecting trees</li>
              <li>Making maintenance decisions</li>
              <li>Acting on hazards</li>
              <li>Following local laws and safety guidelines</li>
              <li>Hiring professionals when needed</li>
            </ul>
            <p>
              ArborTag does not assume responsibility for actions taken or not taken based on information
              in the app.
            </p>
          </div>

          <div className="policies-section">
            <h3>4. Limitation of Liability</h3>
            <p>To the fullest extent permitted by law:</p>
            <ul>
              <li>
                ArborTag is not liable for injuries, damages, losses, or claims arising from tree
                failures, falling branches, storms, or maintenance decisions.
              </li>
              <li>
                ArborTag is not liable for municipal decisions, staff actions, or failure to act on
                logged hazards.
              </li>
              <li>
                ArborTag is not liable for inaccuracies in user-entered data or photos.
              </li>
            </ul>
            <p>
              Municipalities and property owners accept full responsibility for their own risk management
              practices.
            </p>
          </div>

          <div className="policies-section">
            <h3>5. No Warranty</h3>
            <p>
              ArborTag is provided "as-is" without warranties of any kind, including accuracy,
              completeness, reliability, or fitness for a particular purpose. Tree behavior is
              unpredictable, and no software can guarantee safety.
            </p>
          </div>

          <div className="policies-section">
            <h3>6. Municipal Use</h3>
            <p>Municipal customers acknowledge:</p>
            <ul>
              <li>ArborTag is a documentation and workflow tool</li>
              <li>It does not replace certified arborist evaluations</li>
              <li>It does not provide legally binding hazard ratings</li>
              <li>It is not a risk-elimination system</li>
              <li>Municipal staff must follow their own safety protocols</li>
            </ul>
          </div>

          <div className="policies-section">
            <h3>7. Indemnification</h3>
            <p>Users agree to indemnify and hold ArborTag harmless from claims arising from:</p>
            <ul>
              <li>User-entered data</li>
              <li>Maintenance decisions</li>
              <li>Failure to act on hazards</li>
              <li>Misuse of the platform</li>
            </ul>
          </div>

          <div className="policies-section">
            <h3>8. Contact</h3>
            <p>For legal questions: <a href="mailto:rachaelr@rrtech.dev">rachaelr@rrtech.dev</a></p>
          </div>
        </section>

        {/* ── TERMS OF SERVICE ── */}
        <section className="policies-card policies-card-tos">
          <div className="policies-tos-badge">Agreement Required</div>
          <h2>🌿 Terms of Service</h2>
          <p className="policies-meta">Last updated: May 21, 2026</p>

          <div className="policies-section">
            <h3>1. Agreement to Terms</h3>
            <p>
              By accessing or using ArborTag ("the Service"), you agree to be bound by these Terms of
              Service ("Terms"). If you do not agree, you may not use the Service.
            </p>
            <p>
              These Terms apply to all users, including homeowners, gardeners, landowners, municipal
              staff, and any organization using ArborTag.
            </p>
          </div>

          <div className="policies-section">
            <h3>2. Description of the Service</h3>
            <p>ArborTag is a digital platform for documenting, tagging, and tracking plants and trees. The Service provides:</p>
            <ul>
              <li>QR-based plant and tree identification</li>
              <li>Photo and note logging</li>
              <li>Maintenance tracking</li>
              <li>AI-assisted informational suggestions</li>
              <li>Organizational tools for homeowners and municipalities</li>
            </ul>
            <p>
              ArborTag does not provide certified arborist evaluations, professional hazard assessments,
              or legally binding recommendations.
            </p>
          </div>

          <div className="policies-section">
            <h3>3. User Accounts</h3>
            <p>To use ArborTag, you may be required to create an account. You agree to:</p>
            <ul>
              <li>Provide accurate information</li>
              <li>Maintain the security of your login credentials</li>
              <li>Be responsible for all activity under your account</li>
            </ul>
            <p>
              Municipal accounts may include multiple authorized users. The municipality is responsible
              for managing access.
            </p>
          </div>

          <div className="policies-section">
            <h3>4. Acceptable Use</h3>
            <p>You agree not to:</p>
            <ul>
              <li>Use ArborTag for unlawful purposes</li>
              <li>Attempt to access data you do not own</li>
              <li>Reverse-engineer, copy, or resell the Service</li>
              <li>Upload harmful or malicious content</li>
              <li>Misrepresent ArborTag as a professional arborist service</li>
            </ul>
            <p>We reserve the right to suspend or terminate accounts that violate these Terms.</p>
          </div>

          <div className="policies-section policies-section-critical">
            <h3>5. Informational Use Only ⚠️ Critical Liability Section</h3>
            <p className="policies-highlight">ArborTag provides informational tools only. ArborTag does not:</p>
            <ul>
              <li>Replace certified arborists</li>
              <li>Provide professional hazard ratings</li>
              <li>Guarantee tree stability or safety</li>
              <li>Provide legal, insurance, or emergency advice</li>
            </ul>
            <p>
              All maintenance, safety, and risk decisions are the responsibility of the property owner
              or municipality.
            </p>
          </div>

          <div className="policies-section">
            <h3>6. Municipal Use</h3>
            <p>Municipal customers acknowledge:</p>
            <ul>
              <li>ArborTag is a documentation and workflow tool</li>
              <li>It does not replace professional inspections</li>
              <li>It does not provide legally binding assessments</li>
              <li>Staff must follow their own safety protocols</li>
              <li>The municipality is responsible for acting on hazards</li>
            </ul>
            <p>ArborTag is not liable for municipal decisions or failures to act.</p>
          </div>

          <div className="policies-section">
            <h3>7. Subscription Plans &amp; Billing</h3>
            <p>ArborTag offers: Free Tier, Gardener's Tier, Estate Tier, and Municipal / B2B pricing.</p>
            <p>
              By subscribing, you authorize recurring charges until you cancel. Prices may change with
              notice. Municipal contracts may include separate terms.
            </p>
          </div>

          <div className="policies-section">
            <h3>8. Data Ownership &amp; Access</h3>
            <p>You retain ownership of the data you enter into ArborTag. You may request:</p>
            <ul>
              <li>Data export</li>
              <li>Account deletion</li>
              <li>Data deletion (unless restricted by municipal policy)</li>
            </ul>
            <p>Municipalities are responsible for their own data retention requirements.</p>
          </div>

          <div className="policies-section">
            <h3>9. Service Availability</h3>
            <p>We strive to keep ArborTag available, but we do not guarantee uninterrupted service, error-free operation, data accuracy, or compatibility with all devices. We may update, modify, or discontinue features at any time.</p>
          </div>

          <div className="policies-section">
            <h3>10. Limitation of Liability</h3>
            <p>To the fullest extent permitted by law, ArborTag, RR Tech, and its founder are not liable for:</p>
            <ul>
              <li>Injuries or damages caused by tree failures</li>
              <li>Falling branches or storm events</li>
              <li>Municipal or homeowner maintenance decisions</li>
              <li>Inaccuracies in user-entered data</li>
              <li>Delays or failures in acting on hazards</li>
              <li>Loss of data</li>
              <li>Indirect, incidental, or consequential damages</li>
            </ul>
            <p className="policies-highlight">Your use of ArborTag is at your own risk.</p>
          </div>

          <div className="policies-section">
            <h3>11. Indemnification</h3>
            <p>You agree to indemnify and hold ArborTag harmless from claims arising from your use of the Service, your data, your maintenance decisions, your failure to act on hazards, or your violation of these Terms. Municipalities agree to indemnify ArborTag for staff actions.</p>
          </div>

          <div className="policies-section">
            <h3>12. Termination</h3>
            <p>We may suspend or terminate your account if you violate these Terms, misuse the Service, or fail to pay subscription fees. You may terminate your account at any time.</p>
          </div>

          <div className="policies-section">
            <h3>13. Changes to Terms</h3>
            <p>We may update these Terms periodically. Updates will be posted in the app and on our website. Continued use of the Service constitutes acceptance of updated Terms.</p>
          </div>

          <div className="policies-section">
            <h3>14. Governing Law</h3>
            <p>These Terms are governed by the laws of the State of Missouri.</p>
          </div>

          <div className="policies-section">
            <h3>15. Contact Information</h3>
            <p>For questions about these Terms: <a href="mailto:rachaelr@rrtech.dev">rachaelr@rrtech.dev</a></p>
          </div>
        </section>

        <div className="policies-footer">
          <p>© 2026 ArborTag / RR Tech. All rights reserved.</p>
          <button className="btn btn-secondary" onClick={() => navigate('/staff/login')}>← Back to Login</button>
        </div>
      </div>
    </div>
  );
}
