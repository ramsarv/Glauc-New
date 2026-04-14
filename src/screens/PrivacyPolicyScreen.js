/**
 * PrivacyPolicyScreen — Full in-app privacy policy.
 * Last reviewed: April 2026.
 */

import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { T } from '../constants/theme';

export default function PrivacyPolicyScreen({ navigation }) {
  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <LinearGradient colors={[T.bgDeep, T.bg]} style={StyleSheet.absoluteFill} />

      <View style={s.navBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <Text style={s.backIco}>←</Text>
        </TouchableOpacity>
        <Text style={s.navTitle}>Privacy Policy</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.updated}>Last Updated: April 2026</Text>

        <Section title="1. WHO WE ARE">
          <Body>
            Glauc, Inc. ("Glauc," "we," "us," or "our") operates the Glauc mobile application and related services. We provide AI-powered ocular health analysis for general wellness and longevity tracking purposes only. Glauc is not a medical device, and nothing in this policy or the app constitutes medical advice, diagnosis, or treatment.
          </Body>
          <Body>
            For privacy inquiries, contact us at: privacy@glauc.app
          </Body>
        </Section>

        <Section title="2. INFORMATION WE COLLECT">
          <SubHead>A. Biometric Identifiers</SubHead>
          <Body>
            Glauc collects high-resolution photographs of the anterior and posterior segments of the eye (fundus images). Under applicable law — including the Illinois Biometric Information Privacy Act (BIPA), the Texas Capture or Use of Biometric Identifier Act (CUBI), the Washington My Health MY Data Act, and similar 2024–2026 state mandates — eye images used to derive physiological or health characteristics are classified as biometric identifiers and biometric information.
          </Body>
          <Body>
            We collect biometric data only with your explicit, informed, opt-in written consent, provided through our in-app consent flow before any image is analyzed.
          </Body>

          <SubHead>B. Demographic Data</SubHead>
          <Body>
            To calibrate our analysis model, we collect self-reported demographic information: chronological age, biological sex, and ethnicity. This information is used solely to contextualize your ocular biomarker scores and to de-identify data for model training.
          </Body>

          <SubHead>C. Account Information</SubHead>
          <Body>
            When you create an account, we collect your email address, display name (optional), and authentication credentials (password hash or OAuth provider token). We never store plaintext passwords.
          </Body>

          <SubHead>D. Usage and Device Data</SubHead>
          <Body>
            We collect scan timestamps, scan count, app version, device type, and operating system version. We do not collect your precise GPS location, contact list, or any data unrelated to ocular health analysis.
          </Body>
        </Section>

        <Section title="3. HOW WE USE YOUR DATA">
          <Body>
            We use your information for the following purposes:{'\n\n'}
            • To perform ocular age analysis and generate your risk scores and clinical narrative.{'\n'}
            • To maintain your scan history and longitudinal trend data.{'\n'}
            • To send you opt-in wellness reminders (90-day retest notifications).{'\n'}
            • To process your subscription payments securely through our payment processor.{'\n'}
            • To improve the accuracy of our AI models, using de-identified data only (see Section 5).{'\n'}
            • To comply with legal obligations and protect against fraud or abuse.
          </Body>
        </Section>

        <Section title="4. BIOMETRIC DATA: LEGAL COMPLIANCE & CONSENT">
          <Body>
            Because we handle biometric identifiers, we operate under heightened legal obligations. By using Glauc, you provide explicit written consent — as required by BIPA, CUBI, the WA My Health MY Data Act, and CCPA/CPRA — for us to collect, process, and store your biometric eye images for the purpose of providing ocular health analysis.
          </Body>

          <SubHead>Retention Schedule</SubHead>
          <Body>
            Your raw eye images and identifiable scan data are retained only as long as your account is active. We will permanently and irreversibly destroy your raw biometric data:{'\n\n'}
            • Within 90 days of account deletion.{'\n'}
            • Automatically if your account has been inactive for more than three (3) years.{'\n'}
            • Upon written request to privacy@glauc.app, fulfilled within 30 days.
          </Body>

          <SubHead>Security</SubHead>
          <Body>
            All biometric data is encrypted at rest using AES-256 and in transit using TLS 1.3. Storage is on U.S.-based servers. We maintain a written data retention policy and have implemented reasonable security measures consistent with industry standards.
          </Body>

          <SubHead>Illinois Residents (BIPA)</SubHead>
          <Body>
            If you are an Illinois resident, you have the right to: (a) know whether we collect or disclose your biometric identifiers; (b) prevent the sale of your biometric data (we do not sell biometric data); and (c) receive a copy of our written retention policy upon request.
          </Body>

          <SubHead>Texas and Washington Residents</SubHead>
          <Body>
            Residents of Texas and Washington have the right to access, correct, and delete their biometric information and to opt out of any sale or sharing of that information (we do not sell biometric data).
          </Body>
        </Section>

        <Section title="5. AI MODEL TRAINING & DE-IDENTIFICATION">
          <Body>
            With your separate, explicit opt-in consent, Glauc may use your scan data to train and improve our machine learning models. This is distinct from your consent to use the service.
          </Body>

          <SubHead>De-Identification Process</SubHead>
          <Body>
            Before any data is used for model training, it is de-identified using the HIPAA Safe Harbor method, which requires the removal of all 18 categories of personal identifiers specified by 45 CFR § 164.514(b). Once de-identified, the data is no longer considered a biometric identifier or Personal Health Information (PHI) under applicable law.
          </Body>

          <SubHead>Duration of Training Data Retention</SubHead>
          <Body>
            De-identified, anonymized scan data used for AI model training may be retained by Glauc for an indefinite period. Because this data has been stripped of all personal identifiers, it cannot be linked back to you and is not subject to the three-year biometric retention limit described in Section 4. Deletion of your account or raw biometric data does not result in deletion of properly de-identified training data.
          </Body>

          <SubHead>Your Control</SubHead>
          <Body>
            You may opt out of AI training at any time — before consenting, during consent, or afterward via Settings → Privacy → AI Training Consent. Opting out does not affect your access to Glauc's features. It applies only to future data; data already incorporated into model weights cannot be extracted.
          </Body>
        </Section>

        <Section title="6. DATA SHARING AND DISCLOSURE">
          <Body>
            We do not sell your personal data or raw biometric images. We may share data in the following limited circumstances:{'\n\n'}
            • Payment Processors: Stripe processes payments. They receive your payment details only; no health or biometric data is shared with Stripe.{'\n\n'}
            • Authentication Providers: Google and Apple verify your identity for sign-in. They receive no health or scan data.{'\n\n'}
            • Clinical Research Partners: We may share de-identified, aggregated statistical insights (e.g., population-level ocular age distributions) with academic or clinical institutions for the purpose of advancing ocular health research. Individual-level identifiable data is never shared.{'\n\n'}
            • Legal Requirements: We may disclose your data if required by applicable law, court order, or to protect the rights and safety of Glauc or others.{'\n\n'}
            • Business Transfer: In the event of a merger, acquisition, or asset sale, your data may be transferred. We will provide notice before your data is transferred and becomes subject to a different privacy policy.
          </Body>
        </Section>

        <Section title="7. YOUR PRIVACY RIGHTS">
          <Body>
            Depending on your jurisdiction, you may have the following rights. Submit requests to privacy@glauc.app or through the app's Settings → Privacy section.
          </Body>
          <Body>
            • Right to Access: Request a copy of the personal and biometric data we hold about you.{'\n\n'}
            • Right to Correction: Request correction of inaccurate data.{'\n\n'}
            • Right to Deletion: Request permanent deletion of your personal and biometric data. We will fulfill within 30 days (raw data) and confirm in writing.{'\n\n'}
            • Right to Opt Out of Training: Withdraw consent for AI training at any time without penalty.{'\n\n'}
            • Right to Data Portability: Request your scan history in a machine-readable format.{'\n\n'}
            • Right to Non-Discrimination: We will never deny you service, charge higher prices, or provide lesser quality service because you exercised any of these rights.
          </Body>
          <Body>
            California residents have additional rights under CCPA/CPRA, including the right to opt out of the sharing of sensitive personal information and to limit its use. Colorado, Virginia, and Connecticut residents have rights under their respective Consumer Data Privacy Acts. We honor these rights regardless of which state you reside in.
          </Body>
        </Section>

        <Section title="8. CHILDREN'S PRIVACY">
          <Body>
            Glauc is intended for users 18 years of age and older. We do not knowingly collect data from anyone under 18. If you believe we have inadvertently collected data from a minor, contact us immediately at privacy@glauc.app and we will delete it promptly.
          </Body>
        </Section>

        <Section title="9. CHANGES TO THIS POLICY">
          <Body>
            We may update this Privacy Policy to reflect changes in law, technology, or our practices. For material changes — particularly those affecting biometric data collection or AI training use — we will provide in-app notice and, where required by law, obtain fresh consent before the change takes effect. The date at the top of this policy reflects the most recent update.
          </Body>
        </Section>

        <Section title="10. CONTACT">
          <Body>
            Glauc, Inc.{'\n'}
            Privacy inquiries: privacy@glauc.app{'\n'}
            Data deletion requests: privacy@glauc.app{'\n'}
            General support: support@glauc.app
          </Body>
        </Section>

        <Text style={s.footer}>
          © {new Date().getFullYear()} Glauc, Inc. All rights reserved.{'\n'}
          This document was last reviewed by legal counsel in April 2026.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function SubHead({ children }) {
  return <Text style={s.subhead}>{children}</Text>;
}

function Body({ children }) {
  return <Text style={s.body}>{children}</Text>;
}

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: T.bgDeep },
  navBar:  {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: T.border,
  },
  backBtn:  { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  backIco:  { fontFamily: T.bodyMed, fontSize: 22, color: T.white },
  navTitle: { fontFamily: T.bodyMed, fontSize: 17, color: T.white },
  scroll:   { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 48 },
  updated:  { fontFamily: T.bodyLight, fontSize: 12, color: T.muted, marginBottom: 24 },
  section:  { marginBottom: 28 },
  sectionTitle: {
    fontFamily: T.bodySemi, fontSize: 13, color: T.sage,
    letterSpacing: 0.3, marginBottom: 12,
  },
  subhead:  { fontFamily: T.bodyMed, fontSize: 13, color: T.cream, marginTop: 10, marginBottom: 6 },
  body:     { fontFamily: T.body, fontSize: 13, color: T.cream, lineHeight: 21, marginBottom: 10 },
  footer:   { fontFamily: T.bodyLight, fontSize: 11, color: T.faint, textAlign: 'center', lineHeight: 18, marginTop: 8 },
});
