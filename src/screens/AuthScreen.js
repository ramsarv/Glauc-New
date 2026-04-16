/**
 * AuthScreen v2 — Bella-inspired premium medical layout.
 * OAuth-first: Google + Apple as primary CTAs.
 * Email/password is secondary (expandable accordion).
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, ActivityIndicator, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import * as AppleAuthentication from 'expo-apple-authentication';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { T } from '../constants/theme';
import { useAuth } from '../context/AuthContext';

WebBrowser.maybeCompleteAuthSession();

// ── Inline SVG icons ──────────────────────────────────────────
function GoogleIcon({ size = 20 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <Path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <Path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <Path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </Svg>
  );
}

function IrisLogo({ size = 76 }) {
  const cx = size / 2, cy = size / 2;
  const r1 = size * 0.47, r2 = size * 0.325, r3 = size * 0.19, r4 = size * 0.09;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Circle cx={cx} cy={cy} r={r1} stroke={T.sageDark} strokeWidth="1" fill="none" />
      <Circle cx={cx} cy={cy} r={r2} stroke={T.sage}     strokeWidth="2" fill="none" />
      <Circle cx={cx} cy={cy} r={r3} stroke={T.sage}     strokeWidth="1.5" fill={T.sageSoft} />
      <Circle cx={cx} cy={cy} r={r4} fill={T.sage} />
      <Circle cx={cx} cy={cy} r={r4 * 0.35} fill={T.bgDeep} />
      {[0,45,90,135,180,225,270,315].map((angle, i) => {
        const rad = (angle * Math.PI) / 180;
        const x1 = cx + (r3 + 1) * Math.cos(rad);
        const y1 = cy + (r3 + 1) * Math.sin(rad);
        const x2 = cx + (r2 - 1) * Math.cos(rad);
        const y2 = cy + (r2 - 1) * Math.sin(rad);
        return <Line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={T.sage} strokeWidth="1" opacity="0.4" />;
      })}
      <Circle cx={cx - r3 * 0.4} cy={cy - r3 * 0.2} r={r3 * 0.22} fill={T.lavender} opacity="0.5" />
    </Svg>
  );
}

export default function AuthScreen({ onSuccess }) {
  const { login, register, loginWithGoogle, loginWithApple } = useAuth();

  const [mode,      setMode]      = useState('login');
  const [showEmail, setShowEmail] = useState(false);
  const [email,     setEmail]     = useState('');
  const [password,  setPassword]  = useState('');
  const [name,      setName]      = useState('');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [showPass,  setShowPass]  = useState(false);

  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const riseAnim  = useRef(new Animated.Value(32)).current;
  const panelAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
      Animated.timing(riseAnim, { toValue: 0, duration: 700, delay: 150, useNativeDriver: true }),
    ]).start();
  }, []);

  useEffect(() => {
    Animated.timing(panelAnim, {
      toValue: showEmail ? 1 : 0, duration: 300, useNativeDriver: false,
    }).start();
  }, [showEmail]);

  // ── Google OAuth ───────────────────────────────────────────
  // useAuthRequest must always receive an object (passing null causes it to
  // crash reading .iosClientId). Use placeholder strings when not configured
  // so the hook initialises safely — the button is disabled so it never fires.
  const googleConfigured = !!(
    process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ||
    process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID
  );
  const [, response, promptGoogleAsync] = Google.useAuthRequest({
    clientId:        process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID        || 'not-configured',
    iosClientId:     process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID    || 'not-configured',
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || 'not-configured',
    scopes: ['openid', 'profile', 'email'],
  });

  useEffect(() => {
    if (response?.type === 'success') {
      const { id_token } = response.params;
      if (id_token) handleGoogleToken(id_token);
    }
  }, [response]);

  const handleGoogleToken = useCallback(async (idToken) => {
    setLoading(true); setError(null);
    try {
      const result = await loginWithGoogle(idToken);
      onSuccess(result.user, result.isNewUser);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
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
        ? { firstName: credential.fullName.givenName || '', lastName: credential.fullName.familyName || '' }
        : null;
      const result = await loginWithApple(credential.identityToken, fullName);
      onSuccess(result.user, result.isNewUser);
    } catch (err) {
      if (err.code !== 'ERR_REQUEST_CANCELED') setError(err.message || 'Apple Sign In failed.');
    } finally { setLoading(false); }
  }, [loginWithApple, onSuccess]);

  const handleEmailSubmit = useCallback(async () => {
    setError(null);
    if (!email.trim() || !password) return setError('Email and password are required.');
    if (password.length < 8)        return setError('Password must be at least 8 characters.');
    setLoading(true);
    try {
      const result = mode === 'login'
        ? await login(email, password)
        : await register(email, password, name.trim());
      onSuccess(result.user, result.isNewUser);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [email, password, name, mode, login, register, onSuccess]);

  const panelMaxH = panelAnim.interpolate({
    inputRange: [0, 1], outputRange: [0, 500],
  });

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <LinearGradient colors={[T.bgDeep, T.bg]} style={StyleSheet.absoluteFill} />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          {/* Hero */}
          <Animated.View style={[s.hero, { opacity: fadeAnim, transform: [{ translateY: riseAnim }] }]}>
            <IrisLogo size={80} />
            <Text style={s.wordmark}>Glauc</Text>
            <View style={s.pills}>
              <View style={s.pill}>
                <Text style={s.pillStar}>★</Text>
                <Text style={s.pillTxt}>4.8 Rating</Text>
              </View>
              <View style={s.pill}>
                <Text style={s.pillTxt}>12,847+ Analyses</Text>
              </View>
            </View>
          </Animated.View>

          {/* Headline */}
          <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: riseAnim }] }}>
            <Text style={s.headline}>
              {mode === 'login' ? 'Welcome\nBack.' : 'See Your Eyes\nClearly.'}
            </Text>
            <Text style={s.subhead}>
              {mode === 'login'
                ? 'Sign in to continue your ocular health journey.'
                : 'AI-powered retinal analysis. No clinic required.'}
            </Text>
          </Animated.View>

          {/* Primary OAuth */}
          <Animated.View style={[s.oauthGroup, { opacity: fadeAnim }]}>
            <TouchableOpacity
              onPress={() => { setError(null); promptGoogleAsync?.(); }}
              style={[s.oauthBtn, !googleConfigured && s.submitOff]}
              disabled={loading || !googleConfigured} activeOpacity={0.82}
              accessibilityRole="button" accessibilityLabel="Continue with Google"
            >
              {loading ? <ActivityIndicator color={T.white} size="small" /> : (
                <>
                  <GoogleIcon size={20} />
                  <Text style={s.oauthTxt}>Continue with Google</Text>
                </>
              )}
            </TouchableOpacity>

            {Platform.OS === 'ios' && (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                cornerRadius={T.rxl}
                style={{ height: 52 }}
                onPress={handleApple}
              />
            )}

            <View style={s.divRow}>
              <View style={s.divLine} />
              <Text style={s.divTxt}>or use email</Text>
              <View style={s.divLine} />
            </View>

            <TouchableOpacity
              onPress={() => setShowEmail(v => !v)}
              style={s.emailToggleBtn}
              accessibilityRole="button"
            >
              <Text style={s.emailToggleTxt}>
                {showEmail ? '↑ Close' : `${mode === 'login' ? 'Sign in' : 'Sign up'} with email →`}
              </Text>
            </TouchableOpacity>
          </Animated.View>

          {/* Email accordion */}
          <Animated.View style={{ maxHeight: panelMaxH, overflow: 'hidden' }}>
            <View style={s.modeTabs}>
              {['login', 'register'].map(m => (
                <TouchableOpacity
                  key={m} onPress={() => { setMode(m); setError(null); }}
                  style={[s.modeTab, mode === m && s.modeTabOn]}
                  accessibilityRole="tab" accessibilityState={{ selected: mode === m }}
                >
                  <Text style={[s.modeTabTxt, mode === m && s.modeTabTxtOn]}>
                    {m === 'login' ? 'Sign In' : 'Create Account'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={s.form}>
              {mode === 'register' && (
                <TextInput style={s.input} placeholder="Full name (optional)"
                  placeholderTextColor={T.faint} value={name} onChangeText={setName}
                  autoCapitalize="words" returnKeyType="next" accessibilityLabel="Full name" />
              )}
              <TextInput style={s.input} placeholder="Email address"
                placeholderTextColor={T.faint} value={email} onChangeText={setEmail}
                keyboardType="email-address" autoCapitalize="none" autoComplete="email"
                returnKeyType="next" accessibilityLabel="Email address" />
              <View style={s.passRow}>
                <TextInput
                  style={[s.input, { flex: 1, marginBottom: 0 }]}
                  placeholder="Password" placeholderTextColor={T.faint}
                  value={password} onChangeText={setPassword} secureTextEntry={!showPass}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  returnKeyType="done" onSubmitEditing={handleEmailSubmit}
                  accessibilityLabel="Password"
                />
                <TouchableOpacity onPress={() => setShowPass(v => !v)} style={s.eyeBtn}>
                  <Text style={s.eyeIco}>{showPass ? '◉' : '○'}</Text>
                </TouchableOpacity>
              </View>

              {error ? <View style={s.errBox}><Text style={s.errTxt}>{error}</Text></View> : null}

              <TouchableOpacity
                onPress={handleEmailSubmit}
                style={[s.submitBtn, (loading || !email || !password) && s.submitOff]}
                disabled={loading || !email || !password} activeOpacity={0.85}
                accessibilityRole="button"
              >
                {loading
                  ? <ActivityIndicator color={T.bgDeep} size="small" />
                  : <Text style={s.submitTxt}>{mode === 'login' ? 'Sign In' : 'Create Account'}</Text>}
              </TouchableOpacity>
            </View>
          </Animated.View>

          <Text style={s.disclaimer}>
            For wellness use only — not a medical device.{'\n'}
            By continuing you agree to our Terms & Privacy Policy.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: T.bgDeep },
  scroll: { flexGrow: 1, paddingHorizontal: 28, paddingBottom: 48 },

  hero:     { alignItems: 'center', paddingTop: 52, marginBottom: 32, gap: 12 },
  wordmark: { fontFamily: T.display, fontSize: 46, color: T.sage, letterSpacing: 1.5 },
  pills:    { flexDirection: 'row', gap: 8 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: T.surface, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 5,
    borderWidth: 1, borderColor: T.border,
  },
  pillStar: { fontSize: 11, color: '#F6C94E' },
  pillTxt:  { fontFamily: T.body, fontSize: 12, color: T.muted },

  headline: { fontFamily: T.display, fontSize: 40, color: T.white, lineHeight: 48, marginBottom: 12 },
  subhead:  { fontFamily: T.body, fontSize: 15, color: T.cream, lineHeight: 24, marginBottom: 32 },

  oauthGroup: { gap: 12 },
  oauthBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: T.surface, borderWidth: 1, borderColor: T.borderHi,
    borderRadius: T.rxl, paddingVertical: 15,
  },
  oauthTxt: { fontFamily: T.bodyMed, fontSize: 15, color: T.white },

  divRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 4 },
  divLine: { flex: 1, height: 1, backgroundColor: T.border },
  divTxt:  { fontFamily: T.body, fontSize: 12, color: T.faint },

  emailToggleBtn: { alignItems: 'center', paddingVertical: 8 },
  emailToggleTxt: { fontFamily: T.bodyMed, fontSize: 14, color: T.lavender },

  modeTabs: {
    flexDirection: 'row', backgroundColor: T.surface,
    borderRadius: T.rm, borderWidth: 1, borderColor: T.border,
    overflow: 'hidden', marginTop: 20, marginBottom: 14,
  },
  modeTab:    { flex: 1, paddingVertical: 12, alignItems: 'center' },
  modeTabOn:  { backgroundColor: T.sageSoft },
  modeTabTxt: { fontFamily: T.body,    fontSize: 14, color: T.muted },
  modeTabTxtOn:{ fontFamily: T.bodyMed, fontSize: 14, color: T.sage },

  form: { gap: 12 },
  input: {
    backgroundColor: T.surface, borderWidth: 1, borderColor: T.border,
    borderRadius: T.r, paddingHorizontal: 16, paddingVertical: 15,
    color: T.white, fontFamily: T.body, fontSize: 15,
  },
  passRow: { flexDirection: 'row', alignItems: 'center' },
  eyeBtn:  { padding: 14, marginLeft: -46 },
  eyeIco:  { fontSize: 16, color: T.muted },

  errBox: {
    backgroundColor: T.errorSoft, borderRadius: T.r,
    borderWidth: 1, borderColor: `${T.error}25`, padding: 12,
  },
  errTxt: { fontFamily: T.body, fontSize: 13, color: T.error },

  submitBtn: {
    backgroundColor: T.sage, borderRadius: T.rxl,
    paddingVertical: 15, alignItems: 'center', marginTop: 4,
  },
  submitOff: { opacity: 0.4 },
  submitTxt: { fontFamily: T.bodyMed, fontSize: 15, color: T.bgDeep },

  disclaimer: {
    fontFamily: T.bodyLight, fontSize: 11, color: T.faint,
    textAlign: 'center', lineHeight: 18, marginTop: 32,
  },
});
