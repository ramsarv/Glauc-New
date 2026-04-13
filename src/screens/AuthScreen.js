/**
 * AuthScreen — Login / Register / OAuth
 * Supports: Email+Password, Google Sign-In, Apple Sign In
 */

import React, { useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import * as AppleAuthentication from 'expo-apple-authentication';
import { T } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import IrisMotif from '../components/IrisMotif';
import PrimaryButton from '../components/PrimaryButton';

WebBrowser.maybeCompleteAuthSession();

export default function AuthScreen({ onSuccess }) {
  const { login, register, loginWithGoogle, loginWithApple } = useAuth();

  const [mode,     setMode]     = useState('login'); // 'login' | 'register'
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [name,     setName]     = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);
  const [showPass, setShowPass] = useState(false);

  // ── Google OAuth setup ──────────────────────────────────────
  const [_req, response, promptGoogleAsync] = Google.useAuthRequest({
    clientId:        process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID,
    iosClientId:     process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    scopes:          ['openid', 'profile', 'email'],
  });

  React.useEffect(() => {
    if (response?.type === 'success') {
      const { id_token } = response.params;
      if (id_token) handleGoogleToken(id_token);
    }
  }, [response]);

  // ── Handlers ────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    setError(null);
    if (!email.trim() || !password) {
      return setError('Email and password are required.');
    }
    if (password.length < 8) {
      return setError('Password must be at least 8 characters.');
    }
    setLoading(true);
    try {
      const result = mode === 'login'
        ? await login(email, password)
        : await register(email, password, name.trim());
      onSuccess(result.user, result.isNewUser);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [email, password, name, mode, login, register, onSuccess]);

  const handleGoogleToken = useCallback(async (idToken) => {
    setLoading(true);
    setError(null);
    try {
      const result = await loginWithGoogle(idToken);
      onSuccess(result.user, result.isNewUser);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [loginWithGoogle, onSuccess]);

  const handleApple = useCallback(async () => {
    setError(null);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      setLoading(true);
      const fullName = credential.fullName
        ? {
            firstName: credential.fullName.givenName || '',
            lastName:  credential.fullName.familyName || '',
          }
        : null;
      const result = await loginWithApple(credential.identityToken, fullName);
      onSuccess(result.user, result.isNewUser);
    } catch (err) {
      if (err.code !== 'ERR_REQUEST_CANCELED') {
        setError(err.message || 'Apple Sign In failed.');
      }
    } finally {
      setLoading(false);
    }
  }, [loginWithApple, onSuccess]);

  const switchMode = () => {
    setMode(m => m === 'login' ? 'register' : 'login');
    setError(null);
    setEmail('');
    setPassword('');
    setName('');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <LinearGradient
        colors={[`${T.amber}20`, T.obsidian]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.6 }}
        style={StyleSheet.absoluteFill}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.kav}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo */}
          <View style={styles.logoRow}>
            <IrisMotif size={72} opacity={0.85} />
            <Text style={styles.wordmark}>Glauc</Text>
            <Text style={styles.tagline}>Precision ocular health analysis</Text>
          </View>

          {/* Mode toggle */}
          <View style={styles.toggle}>
            {['login', 'register'].map(m => (
              <TouchableOpacity
                key={m}
                onPress={() => { setMode(m); setError(null); }}
                accessibilityRole="tab"
                accessibilityState={{ selected: mode === m }}
                style={[styles.toggleBtn, mode === m && styles.toggleActive]}
              >
                <Text style={[styles.toggleText, mode === m && styles.toggleTextActive]}>
                  {m === 'login' ? 'Sign In' : 'Create Account'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Form */}
          <View style={styles.form}>
            {mode === 'register' && (
              <TextInput
                style={styles.input}
                placeholder="Full name (optional)"
                placeholderTextColor={T.creamLow}
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                returnKeyType="next"
                accessibilityLabel="Full name"
              />
            )}

            <TextInput
              style={styles.input}
              placeholder="Email address"
              placeholderTextColor={T.creamLow}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              returnKeyType="next"
              accessibilityLabel="Email address"
            />

            <View style={styles.passRow}>
              <TextInput
                style={[styles.input, { flex: 1, marginBottom: 0 }]}
                placeholder="Password"
                placeholderTextColor={T.creamLow}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPass}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
                accessibilityLabel="Password"
              />
              <TouchableOpacity
                onPress={() => setShowPass(s => !s)}
                style={styles.eyeBtn}
                accessibilityLabel={showPass ? 'Hide password' : 'Show password'}
              >
                <Text style={styles.eyeIcon}>{showPass ? '👁' : '👁‍🗨'}</Text>
              </TouchableOpacity>
            </View>

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <PrimaryButton onPress={handleSubmit} loading={loading} disabled={!email || !password}>
              {mode === 'login' ? 'Sign In' : 'Create Account'}
            </PrimaryButton>

            {/* Divider */}
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or continue with</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* OAuth buttons */}
            <View style={styles.oauthRow}>
              <TouchableOpacity
                onPress={() => promptGoogleAsync()}
                style={styles.oauthBtn}
                accessibilityLabel="Sign in with Google"
              >
                {loading ? (
                  <ActivityIndicator color={T.cream} size="small" />
                ) : (
                  <>
                    <Text style={styles.oauthIcon}>G</Text>
                    <Text style={styles.oauthText}>Google</Text>
                  </>
                )}
              </TouchableOpacity>

              {Platform.OS === 'ios' && (
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                  buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                  cornerRadius={T.rm}
                  style={styles.appleBtn}
                  onPress={handleApple}
                />
              )}
            </View>

            {/* Switch mode */}
            <TouchableOpacity onPress={switchMode} style={styles.switchRow}>
              <Text style={styles.switchText}>
                {mode === 'login'
                  ? "Don't have an account? "
                  : 'Already have an account? '}
                <Text style={styles.switchLink}>
                  {mode === 'login' ? 'Create one' : 'Sign in'}
                </Text>
              </Text>
            </TouchableOpacity>

            <Text style={styles.disclaimer}>
              For wellness use only. Not a medical device.{'\n'}
              By continuing you agree to our Terms & Privacy Policy.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: T.obsidian },
  kav:    { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: 28, paddingBottom: 40 },

  logoRow: { alignItems: 'center', paddingTop: 40, marginBottom: 36 },
  wordmark: {
    fontFamily: T.display,
    fontSize: 40,
    color: T.cream,
    marginTop: 12,
    letterSpacing: 0.5,
  },
  tagline: {
    fontFamily: T.bodyLight,
    fontSize: 13,
    color: T.creamMid,
    marginTop: 6,
  },

  toggle: {
    flexDirection: 'row',
    backgroundColor: T.surface,
    borderRadius: T.rm,
    borderWidth: 1,
    borderColor: T.border,
    overflow: 'hidden',
    marginBottom: 28,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 13,
    alignItems: 'center',
  },
  toggleActive: { backgroundColor: `${T.amber}20` },
  toggleText: {
    fontFamily: T.body,
    fontSize: 14,
    color: T.creamLow,
  },
  toggleTextActive: {
    fontFamily: T.bodyMed,
    color: T.amber,
  },

  form:  { gap: 14 },
  input: {
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: T.r,
    paddingHorizontal: 16,
    paddingVertical: 16,
    color: T.cream,
    fontFamily: T.body,
    fontSize: 15,
    marginBottom: 0,
  },
  passRow:  { flexDirection: 'row', alignItems: 'center', gap: 0 },
  eyeBtn:   { padding: 12, marginLeft: -44 },
  eyeIcon:  { fontSize: 18 },

  errorBox: {
    backgroundColor: T.redSoft,
    borderRadius: T.r,
    borderWidth: 1,
    borderColor: `${T.red}30`,
    padding: 12,
  },
  errorText: {
    fontFamily: T.body,
    fontSize: 13,
    color: T.red,
  },

  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 4,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: T.border },
  dividerText: {
    fontFamily: T.body,
    fontSize: 12,
    color: T.creamLow,
  },

  oauthRow: { flexDirection: 'row', gap: 12 },
  oauthBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: T.rm,
    paddingVertical: 14,
  },
  oauthIcon: {
    fontFamily: T.bodySemi,
    fontSize: 18,
    color: T.cream,
  },
  oauthText: {
    fontFamily: T.bodyMed,
    fontSize: 14,
    color: T.cream,
  },
  appleBtn: { flex: 1, height: 48 },

  switchRow: { alignItems: 'center', paddingVertical: 4 },
  switchText: {
    fontFamily: T.body,
    fontSize: 13,
    color: T.creamMid,
  },
  switchLink: {
    fontFamily: T.bodyMed,
    color: T.amber,
  },

  disclaimer: {
    fontFamily: T.bodyLight,
    fontSize: 11,
    color: T.creamLow,
    textAlign: 'center',
    lineHeight: 17,
  },
});
