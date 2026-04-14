/**
 * TermsScreen — Full in-app Terms of Service.
 * Last reviewed: April 2026.
 */

import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { T } from '../constants/theme';

export default function TermsScreen({ navigation }) {
  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <LinearGradient colors={[T.bgDeep, T.bg]} style={StyleSheet.absoluteFill} />

      <View style={s.navBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <Text style={s.backIco}>←</Text>
        </TouchableOpacity>
        <Text style={s.navTitle}>Terms of Service</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.updated}>Last Updated: April 2026</Text>

        <Section title="1. GENERAL WELLNESS DISCLOSURE (READ CAREFULLY)">
          <Body>
            Glauc is a general wellness and longevity tracking tool. WE DO NOT PROVIDE MEDICAL ADVICE, MEDICAL DIAGNOSIS, OR TREATMENT RECOMMENDATIONS. The ocular age estimates, biomarker scores, risk indicators, and AI-generated narratives produced by Glauc are for general informational and wellness purposes only. They are not a substitute for the professional judgment of a qualified ophthalmologist, optometrist, or other licensed healthcare provider.
          </Body>
          <Body>
            Glauc is not a medical device as defined by the U.S. Food and Drug Administration (FDA) or any equivalent international regulatory authority. Our platform has not been cleared or approved by the FDA for clinical diagnostic use. Do not use Glauc to diagnose, treat, prevent, or manage any medical condition, including but not limited to glaucoma, macular degeneration, diabetic retinopathy, or any other eye disease.
          </Body>
          <Body>
            ALWAYS SEEK THE ADVICE OF A QUALIFIED HEALTHCARE PROVIDER REGARDING ANY MEDICAL CONDITION OR BEFORE MAKING ANY MEDICAL DECISION. If you believe you are experiencing a medical emergency, call emergency services (911 in the U.S.) immediately.
          </Body>
        </Section>

        <Section title="2. ACCEPTANCE OF TERMS">
          <Body>
            By creating a Glauc account, completing our in-app consent flow, or using any part of our service, you agree to these Terms of Service and our Privacy Policy, incorporated here by reference. If you do not agree, do not use the service.
          </Body>
          <Body>
            You must be at least 18 years old to use Glauc. By accepting these terms, you represent that you are 18 or older and have the legal capacity to enter into a binding agreement.
          </Body>
        </Section>

        <Section title="3. THE SERVICES">
          <Body>
            Glauc provides a mobile platform that analyzes smartphone images of the eye using computer vision and machine learning to generate an estimated ocular age, systemic health risk indicators, and a personalized wellness narrative. The underlying models are trained on clinical datasets and use probabilistic uncertainty quantification (Monte Carlo Dropout, test-time augmentation) to produce calibrated outputs.
          </Body>
          <Body>
            Services are provided on a subscription basis. We reserve the right to modify, suspend, or discontinue any feature of the service at any time with reasonable notice.
          </Body>
        </Section>

        <Section title="4. SUBSCRIPTIONS AND PAYMENTS">
          <Body>
            Glauc offers the following service tiers:{'\n\n'}
            • Single Analysis ($19 one-time) — One complete ocular age analysis.{'\n'}
            • Comprehensive Panel ($29 one-time) — Full 8-biomarker panel with AI clinical narrative.{'\n'}
            • Weekly Single (~$24/month) — Ongoing single analyses, billed monthly.{'\n'}
            • Weekly Comprehensive (~$36/month) — Full panel with AI narrative, billed monthly.
          </Body>
          <Body>
            All fees are charged in U.S. dollars. Subscription plans automatically renew unless cancelled at least 24 hours before the renewal date. Refunds are provided at our discretion for documented technical failures preventing service delivery. We do not provide refunds for completed analyses or for cancellations made after a billing cycle begins.
          </Body>
          <Body>
            On iOS, payments are processed through Apple's In-App Purchase system and are subject to Apple's payment and refund policies. On Android, payments may be processed through Google Play Billing or our third-party payment processor, Stripe. Stripe's Privacy Policy governs data shared with Stripe for payment processing purposes.
          </Body>
        </Section>

        <Section title="5. DATA LICENSE AND OWNERSHIP">
          <SubHead>Your Data</SubHead>
          <Body>
            You retain all rights to your raw eye images and personal identifying information. By using Glauc, you grant us a non-exclusive, royalty-free, worldwide license to access, process, store, and transmit your images and demographic data solely to provide and improve the services described herein, subject to our Privacy Policy.
          </Body>

          <SubHead>AI Training (Conditional)</SubHead>
          <Body>
            If you separately and explicitly opt in to AI model training during the consent flow or via Settings, you grant Glauc an additional license to use de-identified versions of your scan data to train, validate, and improve our machine learning models. This license extends for an indefinite period with respect to properly de-identified data that cannot be linked back to you, as described in our Privacy Policy. You may revoke this additional license at any time through Settings → Privacy, which stops future data from being used but does not affect data already incorporated into model weights.
          </Body>

          <SubHead>Derivative Intelligence</SubHead>
          <Body>
            Glauc owns all intellectual property in the mathematical models, algorithms, trained neural network weights, risk scoring systems, and statistical frameworks developed by or for Glauc, including those developed using de-identified user data. Your use of the service does not confer any ownership interest in these systems. The ocular age estimates and risk scores produced are proprietary outputs of Glauc's models and are licensed to you for personal wellness use only.
          </Body>
        </Section>

        <Section title="6. BIOMETRIC DATA CONSENT">
          <Body>
            As detailed in our Privacy Policy, eye images constitute biometric identifiers under applicable law. We collect biometric data only with your explicit written consent, provided through our mandatory in-app consent flow. This consent is required before any image can be submitted for analysis. You may withdraw consent and request deletion of your biometric data at any time; doing so will require termination of your account, as biometric processing is integral to the service.
          </Body>
        </Section>

        <Section title="7. PROHIBITED USES">
          <Body>
            You agree not to:{'\n\n'}
            • Use Glauc to self-diagnose, self-treat, or make clinical decisions without consulting a licensed healthcare provider.{'\n\n'}
            • Submit images of another person without their explicit consent.{'\n\n'}
            • Attempt to reverse-engineer, decompile, or extract our machine learning models or proprietary algorithms.{'\n\n'}
            • Use automated tools, bots, or scripts to interact with the service.{'\n\n'}
            • Share your account credentials with any other person.{'\n\n'}
            • Use the service for any unlawful purpose or in violation of any applicable law or regulation.
          </Body>
        </Section>

        <Section title="8. DISCLAIMER OF WARRANTIES">
          <Body>
            THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTY OF ANY KIND. TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, GLAUC EXPRESSLY DISCLAIMS ALL WARRANTIES, WHETHER EXPRESS, IMPLIED, STATUTORY, OR OTHERWISE, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
          </Body>
          <Body>
            We do not warrant that the service will be uninterrupted, error-free, or free of harmful components, or that the ocular age estimates or health scores will be accurate, complete, or reliable for any particular individual or purpose.
          </Body>
        </Section>

        <Section title="9. LIMITATION OF LIABILITY">
          <Body>
            TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, GLAUC AND ITS OFFICERS, DIRECTORS, EMPLOYEES, AGENTS, AND SUPPLIERS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, REVENUE, DATA, GOODWILL, OR OTHER INTANGIBLE LOSSES, ARISING OUT OF OR RELATING TO:{'\n\n'}
            (a) Your use of or inability to use the service;{'\n'}
            (b) Any reliance you place on health-tracking data or wellness insights provided by Glauc;{'\n'}
            (c) Any unauthorized access to or use of our servers or your personal data;{'\n'}
            (d) Any delay in or failure to provide the service.
          </Body>
          <Body>
            IN NO EVENT SHALL OUR AGGREGATE LIABILITY TO YOU EXCEED THE GREATER OF (a) THE TOTAL AMOUNT PAID BY YOU TO GLAUC IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM, OR (b) ONE HUNDRED U.S. DOLLARS ($100.00).
          </Body>
          <Body>
            Some jurisdictions do not allow the exclusion of certain warranties or limitations on liability. In such jurisdictions, our liability shall be limited to the maximum extent permitted by law.
          </Body>
        </Section>

        <Section title="10. INDEMNIFICATION">
          <Body>
            You agree to indemnify, defend, and hold harmless Glauc and its affiliates, officers, directors, agents, and employees from and against any claims, liabilities, damages, losses, and expenses (including reasonable legal fees) arising out of or in connection with your use of the service, your violation of these Terms, or your infringement of any third-party right.
          </Body>
        </Section>

        <Section title="11. GOVERNING LAW AND DISPUTES">
          <Body>
            These Terms are governed by and construed in accordance with the laws of the State of Delaware, without regard to its conflict of law principles. Any dispute arising from these Terms or your use of the service shall be resolved through binding arbitration under the rules of the American Arbitration Association, conducted in the English language. Class action lawsuits and class-wide arbitration are waived to the extent permitted by law.
          </Body>
          <Body>
            Nothing in this section prevents either party from seeking injunctive or other equitable relief in a court of competent jurisdiction for infringement of intellectual property rights.
          </Body>
        </Section>

        <Section title="12. CHANGES TO THESE TERMS">
          <Body>
            We may update these Terms at any time. For material changes, we will provide in-app notice at least 30 days before the change takes effect and, where required, obtain fresh consent. Your continued use of the service after the effective date constitutes acceptance of the revised Terms.
          </Body>
        </Section>

        <Section title="13. CONTACT">
          <Body>
            Glauc, Inc.{'\n'}
            Legal: legal@glauc.app{'\n'}
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
