/**
 * ScanScreen v2 — New palette. CameraView + ImagePicker + metadata form.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, TextInput, ActivityIndicator, Animated, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { T } from '../constants/theme';

const GENDERS = ['Male', 'Female', 'Other'];
const RACES   = ['Asian','Black','Hispanic','Middle Eastern','Native American','Pacific Islander','White','Other'];
const MAX_BYTES = 15 * 1024 * 1024;

export default function ScanScreen({ navigation }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady]   = useState(false);
  const [facing,      setFacing]        = useState('back');
  const [flash,       setFlash]         = useState('off');
  const [capturedUri, setCapturedUri]   = useState(null);
  const [capturing,   setCapturing]     = useState(false);
  const [age,    setAge]    = useState('');
  const [gender, setGender] = useState('');
  const [race,   setRace]   = useState('');
  const [error,  setError]  = useState(null);
  const cameraRef = useRef(null);
  const formAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(formAnim, {
      toValue: capturedUri ? 1 : 0, duration: 280, useNativeDriver: true,
    }).start();
  }, [capturedUri]);

  const takePicture = useCallback(async () => {
    if (!cameraRef.current || !cameraReady || capturing) return;
    setCapturing(true); setError(null);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85, exif: false });
      if (photo.fileSize && photo.fileSize > MAX_BYTES) {
        setError('Image too large. Please try again.'); return;
      }
      setCapturedUri(photo.uri);
    } catch { setError('Capture failed. Please try again.'); }
    finally { setCapturing(false); }
  }, [cameraReady, capturing]);

  const pickFromGallery = useCallback(async () => {
    setError(null);
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { setError('Photo library permission required.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85, allowsEditing: true, aspect: [1, 1],
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      if (asset.fileSize && asset.fileSize > MAX_BYTES) {
        setError('Image too large (max 15 MB).'); return;
      }
      setCapturedUri(asset.uri);
    }
  }, []);

  const handleSubmit = useCallback(() => {
    setError(null);
    const ageInt = parseInt(age, 10);
    if (!age || isNaN(ageInt) || ageInt < 10 || ageInt > 110) {
      setError('Enter your age (10–110).'); return;
    }
    if (!gender) { setError('Please select your biological sex.'); return; }
    if (!race)   { setError('Please select your ethnicity.'); return; }
    navigation.navigate('Processing', {
      imageUri: capturedUri,
      metadata: { age: ageInt, gender: gender.toUpperCase(), race },
    });
  }, [age, gender, race, capturedUri, navigation]);

  if (!permission) return <View style={s.root} />;

  if (!permission.granted) {
    return (
      <SafeAreaView style={s.permWrap} edges={['top','bottom']}>
        <LinearGradient colors={[T.bgDeep, T.bg]} style={StyleSheet.absoluteFill} />
        <Text style={s.permIco}>◉</Text>
        <Text style={s.permTitle}>Camera Access Required</Text>
        <Text style={s.permBody}>Glauc needs camera access to capture your eye image for analysis.</Text>
        <TouchableOpacity onPress={requestPermission} style={s.permBtn} activeOpacity={0.85}>
          <Text style={s.permBtnTxt}>Grant Camera Access</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <View style={s.root}>
      {!capturedUri ? (
        /* ── Camera viewfinder ──────────────────────── */
        <View style={{ flex: 1 }}>
          <CameraView
            ref={cameraRef} style={{ flex: 1 }} facing={facing} flash={flash}
            onCameraReady={() => setCameraReady(true)}
          >
            {/* Guide overlay */}
            <View style={s.overlay}>
              <View style={s.guide}>
                <View style={[s.corner, s.cTL]} />
                <View style={[s.corner, s.cTR]} />
                <View style={[s.corner, s.cBL]} />
                <View style={[s.corner, s.cBR]} />
                <Text style={s.guideHint}>Align fundus image in frame</Text>
              </View>
            </View>
            {/* Controls */}
            <SafeAreaView edges={['bottom']} style={s.camCtrl}>
              <TouchableOpacity onPress={() => setFacing(f => f === 'back' ? 'front' : 'back')} style={s.ctrlBtn}>
                <Text style={s.ctrlIco}>⟳</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={takePicture}
                style={[s.shutterBtn, (!cameraReady || capturing) && s.shutterOff]}
                disabled={!cameraReady || capturing}
              >
                {capturing
                  ? <ActivityIndicator color={T.bgDeep} />
                  : <View style={s.shutterInner} />}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setFlash(f => f === 'off' ? 'on' : 'off')} style={s.ctrlBtn}>
                <Text style={s.ctrlIco}>{flash === 'on' ? '⚡' : '⚡̸'}</Text>
              </TouchableOpacity>
            </SafeAreaView>
          </CameraView>

          {error && <View style={s.errBanner}><Text style={s.errBannerTxt}>{error}</Text></View>}

          <View style={s.galleryBar}>
            <TouchableOpacity onPress={pickFromGallery} style={s.galleryBtn} activeOpacity={0.8}>
              <Text style={s.galleryTxt}>Choose from Gallery</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        /* ── Preview + form ──────────────────────────── */
        <Animated.View style={[{ flex: 1 }, { opacity: formAnim }]}>
          <LinearGradient colors={[T.bgDeep, T.bg]} style={StyleSheet.absoluteFill} />
          <ScrollView contentContainerStyle={s.formScroll} keyboardShouldPersistTaps="handled">
            <SafeAreaView edges={['top']}>
              <Text style={s.formTitle}>Confirm Scan</Text>
            </SafeAreaView>

            {/* Preview */}
            <View style={s.previewWrap}>
              <Image source={{ uri: capturedUri }} style={s.preview} />
              <TouchableOpacity onPress={() => { setCapturedUri(null); setError(null); }} style={s.retakeBtn}>
                <Text style={s.retakeTxt}>Retake</Text>
              </TouchableOpacity>
            </View>

            {/* Age */}
            <View style={s.field}>
              <Text style={s.fieldLabel}>Your Age</Text>
              <TextInput
                style={s.input} value={age} onChangeText={setAge}
                placeholder="e.g. 45" placeholderTextColor={T.faint}
                keyboardType="number-pad" maxLength={3}
                accessibilityLabel="Age"
              />
            </View>

            {/* Gender */}
            <View style={s.field}>
              <Text style={s.fieldLabel}>Biological Sex</Text>
              <View style={s.chips}>
                {GENDERS.map(g => (
                  <TouchableOpacity
                    key={g} onPress={() => setGender(g)}
                    style={[s.chip, gender === g && s.chipOn]}
                    accessibilityRole="radio" accessibilityState={{ selected: gender === g }}
                  >
                    <Text style={[s.chipTxt, gender === g && s.chipTxtOn]}>{g}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Race */}
            <View style={s.field}>
              <Text style={s.fieldLabel}>Ethnicity</Text>
              <View style={s.chips}>
                {RACES.map(r => (
                  <TouchableOpacity
                    key={r} onPress={() => setRace(r)}
                    style={[s.chip, race === r && s.chipOn]}
                    accessibilityRole="radio" accessibilityState={{ selected: race === r }}
                  >
                    <Text style={[s.chipTxt, race === r && s.chipTxtOn]}>{r}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {error && <View style={s.errBox}><Text style={s.errTxt}>{error}</Text></View>}

            <TouchableOpacity onPress={handleSubmit} style={s.analyzeBtn} activeOpacity={0.85}>
              <Text style={s.analyzeTxt}>Analyze Eye</Text>
            </TouchableOpacity>

            <Text style={s.disclaimer}>For wellness use only — not a medical device.</Text>
          </ScrollView>
        </Animated.View>
      )}
    </View>
  );
}

const GUIDE = 270;
const CRN   = 22;

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: T.bgDeep },
  permWrap:{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: T.bgDeep },
  permIco: { fontSize: 40, marginBottom: 16, color: T.sage },
  permTitle:{ fontFamily: T.display,  fontSize: 24, color: T.white, textAlign: 'center', marginBottom: 12 },
  permBody: { fontFamily: T.body,     fontSize: 14, color: T.cream, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  permBtn:  { backgroundColor: T.sage, borderRadius: T.rxl, paddingVertical: 15, paddingHorizontal: 32 },
  permBtnTxt:{ fontFamily: T.bodyMed, fontSize: 15, color: T.bgDeep },

  overlay:  { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  guide:    { width: GUIDE, height: GUIDE, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 14 },
  corner:   { position: 'absolute', width: CRN, height: CRN, borderColor: T.sage },
  cTL: { top: 0, left: 0,  borderTopWidth: 2.5, borderLeftWidth:  2.5 },
  cTR: { top: 0, right: 0, borderTopWidth: 2.5, borderRightWidth: 2.5 },
  cBL: { bottom: 0, left: 0,  borderBottomWidth: 2.5, borderLeftWidth:  2.5 },
  cBR: { bottom: 0, right: 0, borderBottomWidth: 2.5, borderRightWidth: 2.5 },
  guideHint:{ fontFamily: T.body, fontSize: 12, color: `${T.sage}CC`, letterSpacing: 0.3 },

  camCtrl: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around',
    paddingHorizontal: 32, paddingVertical: 16,
    backgroundColor: 'rgba(26,29,26,0.75)',
  },
  ctrlBtn:    { width: 52, height: 52, borderRadius: 26, backgroundColor: T.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: T.border },
  ctrlIco:    { fontSize: 22, color: T.white },
  shutterBtn: { width: 76, height: 76, borderRadius: 38, backgroundColor: T.white, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: T.sage },
  shutterOff: { opacity: 0.45 },
  shutterInner:{ width: 58, height: 58, borderRadius: 29, backgroundColor: T.white },

  errBanner: { backgroundColor: T.errorSoft, paddingVertical: 10, paddingHorizontal: 16 },
  errBannerTxt:{ fontFamily: T.body, fontSize: 13, color: T.error },

  galleryBar: { backgroundColor: T.bgDeep, paddingHorizontal: 24, paddingVertical: 14 },
  galleryBtn: {
    borderWidth: 1, borderColor: T.borderHi, borderRadius: T.rm,
    paddingVertical: 14, alignItems: 'center',
  },
  galleryTxt: { fontFamily: T.bodyMed, fontSize: 14, color: T.cream },

  formScroll: { paddingHorizontal: 24, paddingBottom: 48 },
  formTitle:  { fontFamily: T.display, fontSize: 28, color: T.white, marginTop: 20, marginBottom: 20 },
  previewWrap:{ alignSelf: 'center', marginBottom: 28, position: 'relative' },
  preview:    { width: 200, height: 200, borderRadius: T.rm, borderWidth: 2, borderColor: T.sage },
  retakeBtn:  {
    position: 'absolute', bottom: -14, alignSelf: 'center',
    backgroundColor: T.surface, paddingHorizontal: 16, paddingVertical: 5,
    borderRadius: 20, borderWidth: 1, borderColor: T.border,
  },
  retakeTxt:  { fontFamily: T.bodyMed, fontSize: 12, color: T.sage },

  field:      { marginBottom: 20 },
  fieldLabel: { fontFamily: T.bodyMed, fontSize: 13, color: T.muted, marginBottom: 10, letterSpacing: 0.3 },
  input:      {
    backgroundColor: T.surface, borderWidth: 1, borderColor: T.border,
    borderRadius: T.r, paddingHorizontal: 16, paddingVertical: 14,
    color: T.white, fontFamily: T.body, fontSize: 15,
  },
  chips:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:       {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1, borderColor: T.border, backgroundColor: T.surface,
  },
  chipOn:     { borderColor: T.sage, backgroundColor: T.sageSoft },
  chipTxt:    { fontFamily: T.body,    fontSize: 13, color: T.muted },
  chipTxtOn:  { fontFamily: T.bodyMed, fontSize: 13, color: T.sage  },

  errBox:     { backgroundColor: T.errorSoft, borderRadius: T.r, borderWidth: 1, borderColor: `${T.error}25`, padding: 12, marginBottom: 14 },
  errTxt:     { fontFamily: T.body, fontSize: 13, color: T.error },

  analyzeBtn: { backgroundColor: T.sage, borderRadius: T.rxl, paddingVertical: 15, alignItems: 'center', marginBottom: 14 },
  analyzeTxt: { fontFamily: T.bodyMed, fontSize: 15, color: T.bgDeep },
  disclaimer: { fontFamily: T.bodyLight, fontSize: 11, color: T.faint, textAlign: 'center' },
});
