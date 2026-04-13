/**
 * ScanScreen — Camera viewfinder + gallery upload + metadata form.
 * Uses expo-camera (SDK 51 CameraView API) and expo-image-picker.
 * Navigates to ProcessingScreen on submit.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, TextInput, Alert, ActivityIndicator,
  Platform, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'react-native';
import { T } from '../constants/theme';
import PrimaryButton from '../components/PrimaryButton';
import GhostButton from '../components/GhostButton';

const GENDERS = ['Male', 'Female', 'Other'];
const RACES   = [
  'Asian', 'Black', 'Hispanic', 'Middle Eastern',
  'Native American', 'Pacific Islander', 'White', 'Other',
];

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB

export default function ScanScreen({ navigation }) {
  const [permission, requestPermission] = useCameraPermissions();

  // Camera state
  const [cameraReady,  setCameraReady]  = useState(false);
  const [facing,       setFacing]       = useState('back');
  const [flash,        setFlash]        = useState('off');
  const [capturedUri,  setCapturedUri]  = useState(null);
  const [capturing,    setCapturing]    = useState(false);
  const cameraRef = useRef(null);

  // Form state
  const [age,    setAge]    = useState('');
  const [gender, setGender] = useState('');
  const [race,   setRace]   = useState('');

  // UI state
  const [showForm,   setShowForm]   = useState(false);
  const [formError,  setFormError]  = useState(null);
  const [mediaError, setMediaError] = useState(null);

  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (capturedUri) {
      setShowForm(true);
      Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    } else {
      Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() =>
        setShowForm(false)
      );
    }
  }, [capturedUri]);

  // ── Camera capture ──────────────────────────────────────────
  const takePicture = useCallback(async () => {
    if (!cameraRef.current || !cameraReady || capturing) return;
    setCapturing(true);
    setMediaError(null);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.85,
        exif:    false,
      });
      if (photo.fileSize && photo.fileSize > MAX_FILE_BYTES) {
        setMediaError('Image too large. Please try again.');
        return;
      }
      setCapturedUri(photo.uri);
    } catch (err) {
      setMediaError('Failed to capture image. Please try again.');
    } finally {
      setCapturing(false);
    }
  }, [cameraReady, capturing]);

  // ── Gallery picker ──────────────────────────────────────────
  const pickFromGallery = useCallback(async () => {
    setMediaError(null);
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      setMediaError('Photo library permission is required.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality:    0.85,
      allowsEditing: true,
      aspect:     [1, 1],
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      if (asset.fileSize && asset.fileSize > MAX_FILE_BYTES) {
        setMediaError('Image too large (max 15 MB). Please choose a smaller file.');
        return;
      }
      setCapturedUri(asset.uri);
    }
  }, []);

  // ── Retake ──────────────────────────────────────────────────
  const retake = useCallback(() => {
    setCapturedUri(null);
    setFormError(null);
  }, []);

  // ── Submit ──────────────────────────────────────────────────
  const handleSubmit = useCallback(() => {
    setFormError(null);
    const ageInt = parseInt(age, 10);
    if (!age || isNaN(ageInt) || ageInt < 10 || ageInt > 110) {
      setFormError('Enter your age (10–110).');
      return;
    }
    if (!gender) {
      setFormError('Please select your biological sex.');
      return;
    }
    if (!race) {
      setFormError('Please select your ethnicity.');
      return;
    }
    navigation.navigate('Processing', {
      imageUri:  capturedUri,
      metadata:  { age: ageInt, gender: gender.toUpperCase(), race },
    });
  }, [age, gender, race, capturedUri, navigation]);

  // ── Permission gates ────────────────────────────────────────
  if (permission === null) {
    return <PermissionLoading />;
  }
  if (!permission.granted) {
    return <PermissionDenied onRequest={requestPermission} />;
  }

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[T.obsidian, T.obsidian2]}
        style={StyleSheet.absoluteFill}
      />

      {/* ── Camera view ───────────────────────────────────── */}
      {!capturedUri && (
        <View style={styles.cameraWrap}>
          <CameraView
            ref={cameraRef}
            style={styles.camera}
            facing={facing}
            flash={flash}
            onCameraReady={() => setCameraReady(true)}
          >
            {/* Guide overlay */}
            <View style={styles.overlay}>
              <View style={styles.guide}>
                <View style={[styles.corner, styles.cornerTL]} />
                <View style={[styles.corner, styles.cornerTR]} />
                <View style={[styles.corner, styles.cornerBL]} />
                <View style={[styles.corner, styles.cornerBR]} />
                <Text style={styles.guideText}>Align fundus image in frame</Text>
              </View>
            </View>

            {/* Camera controls */}
            <View style={styles.camControls}>
              <TouchableOpacity
                onPress={() => setFacing(f => f === 'back' ? 'front' : 'back')}
                style={styles.camBtn}
                accessibilityLabel="Flip camera"
              >
                <Text style={styles.camBtnIcon}>⟳</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={takePicture}
                style={[styles.captureBtn, (!cameraReady || capturing) && styles.captureBtnDisabled]}
                disabled={!cameraReady || capturing}
                accessibilityLabel="Take picture"
              >
                {capturing
                  ? <ActivityIndicator color={T.obsidian} />
                  : <View style={styles.captureInner} />}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setFlash(f => f === 'off' ? 'on' : 'off')}
                style={styles.camBtn}
                accessibilityLabel={flash === 'off' ? 'Turn flash on' : 'Turn flash off'}
              >
                <Text style={styles.camBtnIcon}>{flash === 'off' ? '⚡' : '✕⚡'}</Text>
              </TouchableOpacity>
            </View>
          </CameraView>

          {mediaError && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{mediaError}</Text>
            </View>
          )}

          <View style={styles.galleryRow}>
            <GhostButton onPress={pickFromGallery} style={styles.galleryBtn}>
              Choose from Gallery
            </GhostButton>
          </View>
        </View>
      )}

      {/* ── Preview + metadata form ───────────────────────── */}
      {capturedUri && (
        <Animated.View style={[styles.formWrap, { opacity: fadeAnim }]}>
          <ScrollView contentContainerStyle={styles.formScroll} keyboardShouldPersistTaps="handled">
            <SafeAreaView edges={['top']}>
              <Text style={styles.formHeading}>Confirm Scan</Text>
            </SafeAreaView>

            {/* Preview thumbnail */}
            <View style={styles.previewWrap}>
              <Image source={{ uri: capturedUri }} style={styles.preview} />
              <TouchableOpacity onPress={retake} style={styles.retakeBtn} accessibilityLabel="Retake photo">
                <Text style={styles.retakeText}>Retake</Text>
              </TouchableOpacity>
            </View>

            {/* Age */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Your Age</Text>
              <TextInput
                style={styles.input}
                value={age}
                onChangeText={setAge}
                placeholder="e.g. 45"
                placeholderTextColor={T.creamLow}
                keyboardType="number-pad"
                maxLength={3}
                accessibilityLabel="Age"
              />
            </View>

            {/* Gender */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Biological Sex</Text>
              <View style={styles.chipRow}>
                {GENDERS.map(g => (
                  <TouchableOpacity
                    key={g}
                    onPress={() => setGender(g)}
                    style={[styles.chip, gender === g && styles.chipActive]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: gender === g }}
                  >
                    <Text style={[styles.chipText, gender === g && styles.chipTextActive]}>
                      {g}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Race / Ethnicity */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Ethnicity</Text>
              <View style={styles.chipRow}>
                {RACES.map(r => (
                  <TouchableOpacity
                    key={r}
                    onPress={() => setRace(r)}
                    style={[styles.chip, race === r && styles.chipActive]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: race === r }}
                  >
                    <Text style={[styles.chipText, race === r && styles.chipTextActive]}>
                      {r}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {formError && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{formError}</Text>
              </View>
            )}

            <PrimaryButton onPress={handleSubmit} style={styles.submitBtn}>
              Analyze Eye
            </PrimaryButton>

            <Text style={styles.disclaimer}>
              For wellness use only. Not a medical device.
            </Text>
          </ScrollView>
        </Animated.View>
      )}
    </View>
  );
}

// ── Permission screens ────────────────────────────────────────
function PermissionLoading() {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={T.amber} size="large" />
    </View>
  );
}

function PermissionDenied({ onRequest }) {
  return (
    <SafeAreaView style={styles.center} edges={['top', 'bottom']}>
      <LinearGradient colors={[`${T.amber}18`, T.obsidian]} style={StyleSheet.absoluteFill} />
      <Text style={styles.permTitle}>Camera Access Required</Text>
      <Text style={styles.permBody}>
        Glauc needs camera access to capture your eye image for ocular age analysis.
      </Text>
      <PrimaryButton onPress={onRequest} style={{ marginTop: 24 }}>
        Grant Camera Access
      </PrimaryButton>
    </SafeAreaView>
  );
}

const CORNER_SIZE = 24;
const GUIDE_SIZE  = 280;

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: T.obsidian },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, backgroundColor: T.obsidian },

  // Camera
  cameraWrap: { flex: 1 },
  camera:     { flex: 1 },

  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guide: {
    width: GUIDE_SIZE,
    height: GUIDE_SIZE,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 12,
  },
  corner: {
    position: 'absolute',
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderColor: T.amber,
  },
  cornerTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },
  guideText: {
    fontFamily: T.body,
    fontSize: 12,
    color: `${T.amber}CC`,
    letterSpacing: 0.3,
  },

  camControls: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 32,
  },
  camBtn: {
    width: 48, height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  camBtnIcon: { fontSize: 20, color: T.cream },

  captureBtn: {
    width: 72, height: 72,
    borderRadius: 36,
    backgroundColor: T.cream,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: T.amber,
  },
  captureBtnDisabled: { opacity: 0.5 },
  captureInner: {
    width: 56, height: 56,
    borderRadius: 28,
    backgroundColor: T.cream,
  },

  errorBanner: {
    backgroundColor: T.redSoft,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  galleryRow: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: T.obsidian,
  },
  galleryBtn: { borderColor: T.border },

  // Form
  formWrap:   { flex: 1 },
  formScroll: { paddingHorizontal: 24, paddingBottom: 40 },
  formHeading: {
    fontFamily: T.display,
    fontSize: 26,
    color: T.cream,
    marginTop: 20,
    marginBottom: 20,
  },

  previewWrap: { position: 'relative', marginBottom: 24, alignSelf: 'center' },
  preview: {
    width: 200, height: 200,
    borderRadius: T.rm,
    borderWidth: 2,
    borderColor: T.amber,
  },
  retakeBtn: {
    position: 'absolute',
    bottom: -14,
    alignSelf: 'center',
    backgroundColor: T.surface,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: T.border,
  },
  retakeText: {
    fontFamily: T.bodyMed,
    fontSize: 12,
    color: T.amber,
  },

  fieldGroup:  { marginBottom: 20 },
  label: {
    fontFamily: T.bodyMed,
    fontSize: 13,
    color: T.creamMid,
    marginBottom: 10,
    letterSpacing: 0.3,
  },
  input: {
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: T.r,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: T.cream,
    fontFamily: T.body,
    fontSize: 15,
  },

  chipRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surface,
  },
  chipActive: { borderColor: T.amber, backgroundColor: T.amberGlow },
  chipText: {
    fontFamily: T.body,
    fontSize: 13,
    color: T.creamMid,
  },
  chipTextActive: {
    fontFamily: T.bodyMed,
    color: T.amber,
  },

  errorBox: {
    backgroundColor: T.redSoft,
    borderRadius: T.r,
    borderWidth: 1,
    borderColor: `${T.red}30`,
    padding: 12,
    marginBottom: 14,
  },
  errorText: {
    fontFamily: T.body,
    fontSize: 13,
    color: T.red,
  },

  submitBtn: { marginBottom: 16 },
  disclaimer: {
    fontFamily: T.bodyLight,
    fontSize: 11,
    color: T.creamLow,
    textAlign: 'center',
  },

  // Permission screens
  permTitle: {
    fontFamily: T.display,
    fontSize: 24,
    color: T.cream,
    textAlign: 'center',
    marginBottom: 16,
  },
  permBody: {
    fontFamily: T.body,
    fontSize: 15,
    color: T.creamMid,
    textAlign: 'center',
    lineHeight: 24,
  },
});
