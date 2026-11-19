import { Link } from 'react-router-dom';
import { supabaseUrl } from '../../lib/supabase';

const LOGO_URL = `${supabaseUrl}/storage/v1/object/public/login-assets/logo-2.png`;

const PURPLE = '#7C3AED';
const NAVY = '#111827';
const SLATE = '#475569';
const MUTED = '#64748B';

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="font-bold" style={{ color: NAVY, fontSize: 20, lineHeight: 1.3 }}>{children}</h2>;
}

function P({ children }: { children: React.ReactNode }) {
  return <p style={{ color: SLATE, fontSize: 16, lineHeight: 1.7 }}>{children}</p>;
}

function UL({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-3" style={{ color: SLATE, fontSize: 16, lineHeight: 1.7 }}>
          <span className="flex-shrink-0 mt-[11px] w-1.5 h-1.5 rounded-full" style={{ background: PURPLE }} />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function Divider() {
  return <div className="flex justify-center py-2" aria-hidden="true"><div className="h-[2px] w-[60px] rounded-full" style={{ background: `linear-gradient(90deg, transparent, ${PURPLE}, transparent)`, boxShadow: `0 0 8px ${PURPLE}66` }} /></div>;
}

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="vp-header sticky top-0 z-30 border-b border-indigo-400/20 shadow-md shadow-indigo-900/15">
        <div className="max-w-2xl mx-auto px-5 h-14 flex items-center">
          <Link to="/chat-library" aria-label="VirgoPlay home">
            <div className="vp-logo-wrap relative">
              <div className="vp-logo-glow" />
              <img src={LOGO_URL} alt="VirgoPlay" className="relative vp-logo-img h-10 w-auto object-contain" />
            </div>
          </Link>
        </div>
      </header>

      <main className="flex-1 w-full max-w-2xl mx-auto px-5 pt-10 pb-16">
        <div className="text-center">
          <h1 className="font-bold" style={{ color: NAVY, fontSize: 32, lineHeight: 1.2 }}>Privacy Policy</h1>
          <p className="mt-3" style={{ color: MUTED, fontSize: 13 }}>Last updated: 19 November 2026</p>
        </div>

        <div className="mt-10 space-y-6">
          <section className="space-y-4">
            <H2>1. Who We Are</H2>
            <P>Virgo Imagination operates VirgoPlay. This Privacy Policy explains how we process personal data when you visit or use VirgoPlay, including the Public Chat Library, client accounts, roleplay conversations, and media-unlock features.</P>
            <P>For privacy questions or requests, contact us at <a href="mailto:support@virgoplay.net" style={{ color: PURPLE, textDecoration: 'underline' }}>support@virgoplay.net</a>.</P>
            <P>We do not publish a street address or organisation number in this policy. You can contact the operator using the email address above.</P>
          </section>

          <Divider />
          <section className="space-y-4">
            <H2>2. Personal Data We Process</H2>
            <P>The information processed depends on whether you browse as a visitor or use a client account. It may include:</P>
            <UL items={[
              'Account and contact details: email address, account identifier, and, if you choose to provide them, your name, phone number, and country.',
              'Sign-in information: information needed to verify your email address and maintain your account session. If you choose Google sign-in, authentication is handled through Google.',
              'Roleplay and chat information: messages you send and AI responses, the roleplay you use, chat-session information, and related progress needed to save and restore your account conversations.',
              'Credits and account activity: credit balance, credit use for unlocking images or videos, purchase/order records, transaction status, and related reference information.',
              'Technical and browser information: information stored in your browser, such as age-gate acceptance, account/session identifiers, and locally cached chat or interface state.'
            ]} />
            <P>Please do not include sensitive personal information in roleplay messages unless you are comfortable sharing it for the purposes described in this policy.</P>
          </section>

          <Divider />
          <section className="space-y-4">
            <H2>3. How We Use Personal Data</H2>
            <UL items={[
              'To create, verify, secure, and maintain client accounts.',
              'To provide roleplay conversations and restore chat history and progress in your account.',
              'To process credit balances and record credit use when images or videos are unlocked.',
              'To operate, maintain, troubleshoot, and protect VirgoPlay and prevent misuse.',
              'To respond to support requests and communicate about account or service issues.',
              'To meet legal obligations and establish, exercise, or defend legal claims where necessary.'
            ]} />
          </section>

          <Divider />
          <section className="space-y-4">
            <H2>4. Chat History and AI Services</H2>
            <P>When you use an account-based roleplay chat, your conversation history is saved in your VirgoPlay client account using our backend database infrastructure. Chat history and related progress are associated with your account so that you can return to previous conversations. A copy of relevant chat state may also be stored locally in your browser to support the experience.</P>
            <P>Your messages and relevant roleplay context are sent to the AI service configured for VirgoPlay so that it can generate replies. This means that information you include in a conversation is processed by that AI service. We do not send your payment-card details or completed checkout details as part of the roleplay prompt.</P>
            <P>AI services are provided by third parties. Their processing of data is subject to the arrangements and terms applicable to the service used. We do not make a blanket promise here about a provider's model-training practices or retention periods; those depend on the provider and the configuration in effect.</P>
            <P>Public or anonymous chat access may use browser storage differently from account-based chat. Where a chat is not associated with a signed-in client account, its locally stored state may remain in that browser rather than being available across devices.</P>
          </section>

          <Divider />
          <section className="space-y-4">
            <H2>5. Service Providers and Data Sharing</H2>
            <P>We use service providers and technical infrastructure to operate VirgoPlay. Depending on the feature used, relevant information may be processed by:</P>
            <UL items={[
              'Supabase, for database, backend, authentication/session-related infrastructure, and storage used by the platform.',
              'The AI service configured for roleplay response generation, which receives chat messages and relevant roleplay context.',
              'Google, if you choose Google sign-in, for the authentication process.',
              'Website hosting and infrastructure providers needed to deliver and secure the website.'
            ]} />
            <P>We share only information that is relevant to providing the feature or service, maintaining security, or meeting a legal requirement. We do not sell your personal data.</P>
            <P>Service providers may process data in countries outside your own, including outside the European Economic Area. Where GDPR applies, we use appropriate safeguards for international transfers when required by law.</P>
          </section>

          <Divider />
          <section className="space-y-4">
            <H2>6. Credits, Orders and Payments</H2>
            <P>The current Buy Credits interface in the project is explicitly marked as test mode: it describes simulated purchases, states that no payment provider is connected, and says no real money is charged. The platform records test orders and credit activity in its database.</P>
            <P>On that basis, this policy does not describe live card-payment processing as an active feature. If real payment processing is introduced, this policy must be updated to identify the relevant payment provider and explain the personal data shared for payment processing before that feature is used.</P>
          </section>

          <Divider />
          <section className="space-y-4">
            <H2>7. Legal Bases for Processing</H2>
            <P>Where the GDPR applies, we rely on the legal basis that is appropriate to the purpose:</P>
            <UL items={[
              'Contract: to create and operate your account, provide roleplay and chat features, maintain chat history, and manage credits and account activity you request.',
              'Legitimate interests: to secure, maintain, troubleshoot, and improve the reliability of the platform, prevent abuse, and handle support, where those interests are not overridden by your rights.',
              'Legal obligation: to retain or disclose information when required by applicable law.',
              'Consent: where consent is required for a particular optional processing activity. You may withdraw consent where processing is based on consent; this does not affect processing already carried out lawfully.'
            ]} />
          </section>

          <Divider />
          <section className="space-y-4">
            <H2>8. Cookies and Local Browser Storage</H2>
            <P>VirgoPlay uses browser local storage for essential platform functions. For example, the site stores whether you have accepted the 18+ access gate and may store account/session identifiers and locally cached chat or interface state.</P>
            <P>These items help the website remember your access choice or maintain the experience between page visits. Clearing your browser storage may remove locally saved state or require you to complete the access gate or sign in again. Account-based chat history is also stored in the backend as described above.</P>
            <P>This policy does not claim that the site uses advertising cookies or third-party analytics trackers. If such tools are added, the policy and any required consent controls should be updated.</P>
          </section>

          <Divider />
          <section className="space-y-4">
            <H2>9. Data Retention and Account Deletion</H2>
            <P>We keep personal data for as long as reasonably necessary to provide the service, maintain your account and chat history, manage credits and account records, protect the platform, resolve disputes, and meet legal obligations.</P>
            <P>Different data may be kept for different periods. We have not stated a fixed deletion period here because retention depends on the type of record and applicable operational or legal requirements.</P>
            <P>You may contact us at <a href="mailto:support@virgoplay.net" style={{ color: PURPLE, textDecoration: 'underline' }}>support@virgoplay.net</a> to request account closure or deletion of personal data. We will assess and respond to the request under applicable data protection law. Some information may need to be retained where the law permits or requires it, or where it is needed to establish, exercise, or defend legal claims.</P>
          </section>

          <Divider />
          <section className="space-y-4">
            <H2>10. Your Data Protection Rights</H2>
            <P>Where the GDPR applies, you may have the right to:</P>
            <UL items={[
              'Request access to your personal data.',
              'Request correction of inaccurate or incomplete data.',
              'Request erasure of personal data in circumstances provided by law.',
              'Request restriction of processing in certain circumstances.',
              'Object to processing based on legitimate interests.',
              'Receive data you provided in a portable format, where the right to data portability applies.',
              'Withdraw consent where processing is based on consent.'
            ]} />
            <P>To exercise a right, contact <a href="mailto:support@virgoplay.net" style={{ color: PURPLE, textDecoration: 'underline' }}>support@virgoplay.net</a>. We may need to verify your request before acting on it.</P>
            <P>You also have the right to lodge a complaint with your local data protection supervisory authority. In Sweden, this is the Swedish Authority for Privacy Protection (IMY): <a href="https://www.imy.se/" target="_blank" rel="noreferrer" style={{ color: PURPLE, textDecoration: 'underline' }}>www.imy.se</a>.</P>
          </section>

          <Divider />
          <section className="space-y-4">
            <H2>11. Security</H2>
            <P>We use technical and organisational measures intended to protect personal data and platform accounts. No online service or method of transmission can be guaranteed to be completely secure. You should keep access to your email account and devices secure and contact us if you believe your VirgoPlay account has been accessed without permission.</P>
          </section>

          <Divider />
          <section className="space-y-4">
            <H2>12. Adults Only</H2>
            <P>VirgoPlay is intended only for people aged 18 or over. The platform uses an age declaration/access gate. The gate records the acceptance choice in browser storage; it is not identity-document or independent age verification. We do not knowingly intend to provide the service to anyone under 18. If you believe a minor has provided personal data to us, contact us so we can review the matter.</P>
          </section>

          <Divider />
          <section className="space-y-4">
            <H2>13. Changes to This Policy</H2>
            <P>We may update this Privacy Policy when VirgoPlay's features, data practices, service providers, or legal requirements change. The current version will be published on this page with its revision date. Where required by law, we will provide notice or obtain consent for material changes.</P>
          </section>

          <Divider />
          <section className="space-y-4">
            <H2>14. Contact</H2>
            <P>For questions, privacy requests, or concerns about how personal data is handled, contact the operator:</P>
            <P><strong>Virgo Imagination</strong><br />Operator of VirgoPlay<br />Email: <a href="mailto:support@virgoplay.net" style={{ color: PURPLE, textDecoration: 'underline' }}>support@virgoplay.net</a></P>
          </section>
        </div>
      </main>

      <footer className="pb-8 pt-4 text-center text-xs text-slate-400">
        <Link to="/terms-of-service" className="hover:text-slate-600 transition-colors">Terms &amp; Conditions</Link>
        <span className="mx-2" aria-hidden="true">•</span>
        <Link to="/about-us" className="hover:text-slate-600 transition-colors">About VirgoPlay</Link>
      </footer>
    </div>
  );
}
