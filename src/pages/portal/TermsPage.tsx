import { Link } from 'react-router-dom';
import { supabaseUrl } from '../../lib/supabase';

const LOGO_URL = `${supabaseUrl}/storage/v1/object/public/login-assets/logo-2.png`;

const PURPLE = '#7C3AED';
const NAVY = '#111827';
const SLATE = '#475569';
const MUTED = '#64748B';

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-bold" style={{ color: NAVY, fontSize: 20, lineHeight: 1.3 }}>
      {children}
    </h2>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ color: SLATE, fontSize: 16, lineHeight: 1.7 }}>
      {children}
    </p>
  );
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
  return (
    <div className="flex justify-center py-2" aria-hidden="true">
      <div
        className="h-[2px] w-[60px] rounded-full"
        style={{ background: `linear-gradient(90deg, transparent, ${PURPLE}, transparent)`, boxShadow: `0 0 8px ${PURPLE}66` }}
      />
    </div>
  );
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header — same component behavior as the Public Chat Library page */}
      <header className="vp-header sticky top-0 z-30 border-b border-indigo-400/20 shadow-md shadow-indigo-900/15">
        <div className="max-w-2xl mx-auto px-5 h-14 flex items-center">
          <Link to="/chat-library" aria-label="VirgoPlay home">
            <div className="vp-logo-wrap relative">
              <div className="vp-logo-glow" />
              <img
                src={LOGO_URL}
                alt="VirgoPlay"
                className="relative vp-logo-img h-10 w-auto object-contain"
              />
            </div>
          </Link>
        </div>
      </header>

      <main className="flex-1 w-full max-w-2xl mx-auto px-5 pt-10 pb-16">
        <div className="text-center">
          <h1 className="font-bold" style={{ color: NAVY, fontSize: 32, lineHeight: 1.2 }}>
            Terms &amp; Conditions
          </h1>
          <p className="mt-3" style={{ color: MUTED, fontSize: 13 }}>
            Last updated: 19 November 2026
          </p>
        </div>

        <div className="mt-10 space-y-6">
          <section className="space-y-4">
            <H2>1. Introduction</H2>
            <P>Welcome to VirgoPlay.</P>
            <P>
              Virgo Imagination operates VirgoPlay. VirgoPlay is an online platform focused on adult interactive roleplay and fictional storytelling. All roleplays currently published on the platform are published and provided by Virgo Imagination. Clients can interact with available roleplays, purchase credit packages, and use credits to unlock paid images and videos. Chat access itself is unlimited.
            </P>
            <P>
              These Terms &amp; Conditions govern your access to and use of VirgoPlay, including its website, public roleplay library, credit system, media content, and associated features.
            </P>
            <P>
              By accessing or using VirgoPlay, you agree to these Terms &amp; Conditions. If you do not agree, you must stop using the platform.
            </P>
          </section>

          <Divider />

          <section className="space-y-4">
            <H2>2. Age Requirement</H2>
            <P>VirgoPlay is intended exclusively for adults aged 18 and over.</P>
            <P>By accessing the platform, you confirm that:</P>
            <UL items={[
              'You are at least 18 years old.',
              'You are legally permitted to access adult-oriented content in your location.',
              'You will not allow minors to access your account or use the platform\'s services.',
              'You will comply with applicable age restrictions and laws.',
            ]} />
            <P>
              VirgoPlay may use age declarations, access restrictions, verification procedures, or other safeguards where appropriate. An age declaration alone does not constitute independent verification of a person's age.
            </P>
            <P>
              We reserve the right to restrict access or suspend an account if we reasonably believe that an age requirement has been violated.
            </P>
          </section>

          <Divider />

          <section className="space-y-4">
            <H2>3. Public Chat Library and Visitor Access</H2>
            <P>
              VirgoPlay provides a Public Chat Library where visitors can browse available roleplays and explore published scenarios. To start a chat, visitors must pass the platform's applicable access gate and complete the required login or registration steps.
            </P>
            <P>
              Certain activities, including account-specific functions, require a registered account and appropriate authentication.
            </P>
            <P>
              We may update, reorganize, restrict, or remove library content and features to maintain the platform, address safety concerns, or comply with applicable law.
            </P>
            <P>
              Visitors must use the Public Chat Library responsibly and must not attempt to bypass access controls, interfere with platform operations, or misuse available features.
            </P>
          </section>

          <Divider />

          <section className="space-y-4">
            <H2>4. Accounts and Registration</H2>
            <P>Certain VirgoPlay features require a registered account.</P>
            <P>When registering, you agree to:</P>
            <UL items={[
              'Provide accurate information where requested.',
              'Keep your login credentials confidential.',
              'Take reasonable steps to prevent unauthorized account access.',
              'Notify us if you suspect unauthorized use of your account.',
              'Use your account only for lawful purposes.',
              'Avoid impersonation, fraudulent activity, and misleading information.',
            ]} />
            <P>
              You are responsible for activities carried out through your account, except where applicable law provides otherwise.
            </P>
            <P>
              Accounts and access permissions may differ depending on the features available to your account.
            </P>
            <P>
              You must not create accounts to evade a suspension, impersonate another person, or circumvent platform restrictions.
            </P>
          </section>

          <Divider />

          <section className="space-y-4">
            <H2>5. Roleplay Experiences and Fictional Content</H2>
            <P>
              Roleplays on VirgoPlay are designed for interactive entertainment and fictional storytelling.
            </P>
            <P>
              A roleplay may include fictional relationships, personalities, dialogue, situations, and scenarios. The existence of a roleplay does not establish that its events, statements, or relationships are real.
            </P>
            <P>
              Users should understand that interactive roleplay is a digital experience and should not treat fictional dialogue as a substitute for professional advice or verified factual information.
            </P>
            <P>
              Users must not use roleplays to harass, threaten, exploit, defraud, or otherwise harm another person.
            </P>
            <P>
              VirgoPlay may establish additional content standards and restrictions as the platform develops.
            </P>
          </section>

          <Divider />

          <section className="space-y-4">
            <H2>6. Images, Videos, and Pre-Generated Media</H2>
            <P>
              Certain roleplays include supporting images and videos that are prepared in advance and revealed at appropriate points during a scenario.
            </P>
            <P>
              The timing and availability of visual content may depend on the roleplay's design and the features available within the platform.
            </P>
            <P>Users acknowledge that:</P>
            <UL items={[
              'Supporting media forms part of the roleplay experience.',
              'Images and videos may contain visual imperfections, inconsistencies, or other errors.',
              'Published media may be updated, replaced, restricted, or removed.',
              'The availability of particular media is subject to the applicable roleplay and platform rules.',
            ]} />
            <P>
              All media made available on VirgoPlay must be lawful, and Virgo Imagination holds the necessary rights and permissions for the media it publishes.
            </P>
            <P>
              Users must not upload, share, or distribute unlawful intimate imagery, non-consensual sexual content, or content that violates another person's rights.
            </P>
          </section>

          <Divider />

          <section className="space-y-4">
            <H2>7. Credits, Payments, and Unlocking Media</H2>
            <P>
              Virgo Imagination operates VirgoPlay. Clients can purchase credit packages from Virgo Imagination. The available credit packages and their prices are displayed on the platform at the time of purchase.
            </P>
            <P>
              Credits are used to unlock paid images and videos within roleplays. Credits are deducted when a client unlocks paid media.
            </P>
            <P>
              Chat access itself is unlimited. Chatting with roleplays does not consume credits.
            </P>
            <P>
              Credits have no cash value and cannot be exchanged for money, transferred between accounts, or used outside VirgoPlay.
            </P>
          </section>

          <Divider />

          <section className="space-y-4">
            <H2>8. Failed Payments and Payment Problems</H2>
            <P>
              If a payment fails and the payment is not captured, no credits are added to your account.
            </P>
            <P>
              If you see a pending or temporarily reserved amount on your statement, or money appears to have been deducted despite a failed payment, please contact us at <a href="mailto:support@virgoplay.net" style={{ color: PURPLE, textDecoration: 'underline' }}>support@virgoplay.net</a>.
            </P>
            <P>
              Virgo Imagination will investigate and resolve reported payment problems.
            </P>
          </section>

          <Divider />

          <section className="space-y-4">
            <H2>9. Unused Credits</H2>
            <P>
              Remaining unused credits stay in your account and remain your property during the applicable retention period.
            </P>
            <P>
              If your account is closed, remaining credits are retained for 90 days. After 90 days, remaining credits are forfeited, subject to mandatory consumer rights and applicable law.
            </P>
          </section>

          <Divider />

          <section className="space-y-4">
            <H2>10. Refund Policy</H2>
            <P>
              A purchased credit package is eligible for a refund if the entire package remains completely unused. If any credits from that package have been used, it is not eligible for a refund under this package-refund policy.
            </P>
            <P>
              Refund requests must be submitted by email to <a href="mailto:support@virgoplay.net" style={{ color: PURPLE, textDecoration: 'underline' }}>support@virgoplay.net</a>. Virgo Imagination will resolve refund requests within 48 working hours.
            </P>
            <P>
              This policy does not restrict mandatory statutory consumer rights, including any applicable withdrawal rights.
            </P>
          </section>

          <Divider />

          <section className="space-y-4">
            <H2>11. Content Ownership and Intellectual Property</H2>
            <P>
              Users generally retain ownership of original content that they lawfully create and submit to VirgoPlay, subject to third-party rights and applicable law.
            </P>
            <P>
              By submitting content on VirgoPlay, you grant VirgoPlay a non-exclusive, worldwide licence to host, store, reproduce, display, distribute, and technically process that content as reasonably necessary to operate, present, secure, and promote the platform and the roleplay experience.
            </P>
            <P>
              This licence applies only to the extent necessary for the stated purposes and remains subject to applicable law and any separate agreement governing the content.
            </P>
            <P>You confirm that:</P>
            <UL items={[
              'You own the content or have the necessary permissions and licences.',
              "Your content does not unlawfully infringe another person's intellectual property, privacy, publicity, or other rights.",
              'You will not knowingly submit stolen, unlawfully copied, or misleadingly attributed material.',
            ]} />
            <P>
              You must not copy, redistribute, sell, or commercially exploit another person's content without the necessary permission or legal basis.
            </P>
            <P>
              VirgoPlay's name, branding, website design, software, and other platform materials may be protected by intellectual property rights. You may not use these materials without authorization, except as permitted by law.
            </P>
            <P>
              Nothing in these terms transfers ownership of your original content to VirgoPlay.
            </P>
          </section>

          <Divider />

          <section className="space-y-4">
            <H2>12. About the Operator</H2>
            <P>
              Virgo Imagination operates VirgoPlay.
            </P>
            <P>Business name: Virgo Imagination</P>
            <P>Business address: Södergatan 53, 195 47 Märsta, Sweden</P>
            <P>
              Contact email: <a href="mailto:support@virgoplay.net" style={{ color: PURPLE, textDecoration: 'underline' }}>support@virgoplay.net</a>
            </P>
          </section>

          <Divider />

          <section className="space-y-4">
            <H2>13. Content Moderation and Platform Enforcement</H2>
            <P>
              VirgoPlay may review content, investigate reports, and take reasonable measures to enforce these Terms &amp; Conditions.
            </P>
            <P>Depending on the circumstances, actions may include:</P>
            <UL items={[
              'Requesting changes to content.',
              'Restricting visibility or access to a roleplay.',
              'Rejecting or removing published material.',
              'Temporarily restricting account functionality.',
              'Suspending or terminating an account.',
              'Preserving relevant information where legally required or permitted.',
              'Reporting suspected unlawful activity to the appropriate authorities where required or appropriate.',
            ]} />
            <P>
              We aim to apply these measures proportionately, taking into account the nature and seriousness of the issue, relevant safety risks, and applicable legal obligations.
            </P>
            <P>
              Where appropriate and legally permissible, users may be informed of a moderation decision and the available method for requesting a review.
            </P>
            <P>
              Nothing in these terms excludes rights or procedures that must be provided under applicable law.
            </P>
          </section>

          <Divider />

          <section className="space-y-4">
            <H2>14. Account Suspension and Termination</H2>
            <P>You may stop using VirgoPlay at any time.</P>
            <P>
              VirgoPlay may suspend, restrict, or terminate access where reasonably necessary because of a breach of these terms, unlawful activity, security concerns, abuse, or other legitimate operational or legal reasons.
            </P>
            <P>
              Where appropriate and legally permissible, we may provide notice and an opportunity to address the issue before taking action. Immediate action may be necessary where there is a serious safety, security, or legal risk.
            </P>
            <P>
              When an account is terminated, access to account-specific features and associated content may be restricted or removed, subject to applicable law and any separate agreement.
            </P>
            <P>
              Termination does not remove obligations or liabilities that arose before termination, or provisions that by their nature must continue to apply.
            </P>
          </section>

          <Divider />

          <section className="space-y-4">
            <H2>15. Privacy and Personal Data</H2>
            <P>
              VirgoPlay processes personal data in connection with operating its website, providing accounts, handling credit purchases and media unlocks, maintaining security, and complying with legal obligations.
            </P>
            <P>
              The types of data processed and the purposes of processing depend on how you use the platform and which features you access.
            </P>
            <P>
              Personal data will be handled in accordance with applicable data protection law, including the General Data Protection Regulation (GDPR) where applicable.
            </P>
            <P>Our Privacy Policy provides further information about:</P>
            <UL items={[
              'The personal data we collect.',
              'The purposes and legal bases for processing.',
              'Data retention and security.',
              'Cookies and similar technologies, where applicable.',
              'Data sharing and service providers.',
              'Your rights and how to exercise them.',
            ]} />
            <P>
              These Terms &amp; Conditions should be read together with the Privacy Policy. The Privacy Policy explains personal data practices in greater detail and does not replace any rights provided by applicable law.
            </P>
          </section>

          <Divider />

          <section className="space-y-4">
            <H2>16. Service Availability and Changes</H2>
            <P>
              VirgoPlay may update, maintain, modify, or discontinue features from time to time.
            </P>
            <P>
              We do not guarantee that every feature will always be available without interruption or error. Availability may be affected by maintenance, technical problems, security incidents, third-party services, or circumstances beyond our reasonable control.
            </P>
            <P>
              We will take reasonable steps to maintain the platform and address material operational issues.
            </P>
            <P>
              Where required by applicable law, users will be given appropriate notice of material changes or discontinuation of services.
            </P>
          </section>

          <Divider />

          <section className="space-y-4">
            <H2>17. Disclaimers and Liability</H2>
            <P>
              VirgoPlay is provided subject to these Terms &amp; Conditions and applicable law.
            </P>
            <P>
              To the extent permitted by law, we do not guarantee uninterrupted availability, error-free operation, or any particular outcome from using a roleplay or unlocking media.
            </P>
            <P>
              Users are responsible for their own conduct and for ensuring that their activities comply with applicable laws and these terms.
            </P>
            <P>
              Nothing in these Terms &amp; Conditions excludes or limits liability where such exclusion or limitation is prohibited by applicable law. In particular, nothing here removes mandatory consumer rights or other non-waivable statutory protections.
            </P>
            <P>
              Where legally permitted, VirgoPlay is not responsible for losses arising solely from a user's unlawful conduct, unauthorized use of another person's content, or misuse of the platform, subject to any liability that applicable law imposes on VirgoPlay.
            </P>
          </section>

          <Divider />

          <section className="space-y-4">
            <H2>18. Changes to These Terms</H2>
            <P>
              VirgoPlay may update these Terms &amp; Conditions to reflect changes in platform features, operational requirements, applicable laws, or business practices.
            </P>
            <P>
              The revised version will be published on the website with an updated revision date.
            </P>
            <P>
              Where required by applicable law, users will receive appropriate notice of material changes and, where applicable, an opportunity to accept or reject them.
            </P>
            <P>
              Continued use of the platform after changes take effect may constitute acceptance where permitted by law. Any mandatory rights or consent requirements remain unaffected.
            </P>
          </section>

          <Divider />

          <section className="space-y-4">
            <H2>19. Governing Law and Disputes</H2>
            <P>These Terms &amp; Conditions are subject to applicable law.</P>
            <P>
              Where legally permissible, Swedish law will govern disputes relating to these terms, without overriding mandatory consumer protections or other mandatory legal provisions that apply in the user's circumstances.
            </P>
            <P>
              If a dispute arises, users are encouraged to contact VirgoPlay first to seek a reasonable resolution.
            </P>
            <P>
              Nothing in this section prevents a user from exercising statutory rights, bringing a claim before a competent court, or using any applicable alternative dispute resolution mechanism.
            </P>
          </section>

          <Divider />

          <section className="space-y-4">
            <H2>20. Contact</H2>
            <P>
              Virgo Imagination operates VirgoPlay. For questions about these Terms &amp; Conditions, platform rules, credits, refunds, or account-related matters, please contact us at <a href="mailto:support@virgoplay.net" style={{ color: PURPLE, textDecoration: 'underline' }}>support@virgoplay.net</a>.
            </P>
            <P>
              The operator's business name and address are provided in the "About the Operator" section above.
            </P>
            <P>
              By using VirgoPlay, you acknowledge that you have read and understood these Terms &amp; Conditions and agree to comply with them.
            </P>
          </section>
        </div>
      </main>
    </div>
  );
}
