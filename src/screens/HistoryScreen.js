/**
 * HistoryScreen v2 — New palette + SVG trend chart.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle, Line, Text as SvgText } from 'react-native-svg';
import { T, RISK_COLORS } from '../constants/theme';
import Card from '../components/Card';
import { apiGetHistory } from '../services/api';

const { width: W } = Dimensions.get('window');
const CHART_W = W - 48;
const CHART_H = 120;
const PAD     = { l: 40, r: 16, t: 14, b: 30 };

export default function HistoryScreen({ navigation }) {
  const [scans,       setScans]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error,       setError]       = useState(null);
  const [page,        setPage]        = useState(0);
  const [hasMore,     setHasMore]     = useState(true);
  const mounted = useRef(true);

  useEffect(() => () => { mounted.current = false; }, []);

  const fetch = useCallback(async (p = 0, append = false) => {
    try {
      const data  = await apiGetHistory(p);
      if (!mounted.current) return;
      const items = data.results || data.history || [];
      setScans(prev => append ? [...prev, ...items] : items);
      setHasMore(items.length > 0 && (data.has_more ?? items.length >= 50));
      setPage(p);
      setError(null);
    } catch (err) { if (mounted.current) setError(err.message); }
  }, []);

  useEffect(() => {
    (async () => { setLoading(true); await fetch(0); setLoading(false); })();
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true); await fetch(0); setRefreshing(false);
  }, [fetch]);

  const onEndReached = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true); await fetch(page + 1, true); setLoadingMore(false);
  }, [loadingMore, hasMore, page, fetch]);

  const chartData = scans.filter(s => s.predicted_age != null).slice().reverse().slice(-12);

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <LinearGradient colors={[`${T.sage}0A`, T.bgDeep]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 0.35 }} style={StyleSheet.absoluteFill} />
      <FlatList
        data={scans}
        keyExtractor={(item, i) => item.session_id || item.id || String(i)}
        contentContainerStyle={s.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.sage} />}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.3}
        ListHeaderComponent={() => (
          <View>
            <Text style={s.heading}>Scan History</Text>
            {chartData.length >= 2 && (
              <Card style={s.chartCard}>
                <Text style={s.chartTitle}>Ocular Age Trend</Text>
                <TrendChart data={chartData} />
              </Card>
            )}
            {loading && <ActivityIndicator color={T.sage} size="large" style={{ marginTop: 40 }} />}
            {!loading && error && <Text style={s.errTxt}>{error}</Text>}
            {!loading && !error && scans.length === 0 && (
              <View style={s.empty}>
                <Text style={s.emptyIco}>◉</Text>
                <Text style={s.emptyTitle}>No scans yet</Text>
                <Text style={s.emptyBody}>Complete your first eye scan to start tracking your ocular health.</Text>
              </View>
            )}
          </View>
        )}
        renderItem={({ item }) => (
          <ScanRow scan={item} onPress={() => navigation.navigate('Results', { result: item })} />
        )}
        ListFooterComponent={() =>
          loadingMore ? <ActivityIndicator color={T.sage} style={{ marginVertical: 16 }} /> : null
        }
      />
    </SafeAreaView>
  );
}

function ScanRow({ scan, onPress }) {
  const level = scan.risk_level?.toLowerCase() || 'low';
  const color = RISK_COLORS[level] || T.sage;
  const date  = scan.timestamp
    ? new Date(scan.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'Unknown date';
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75} accessibilityRole="button">
      <Card style={s.row}>
        <View style={s.rowLeft}>
          <Text style={s.rowDate}>{date}</Text>
          {scan.predicted_age != null && (
            <Text style={s.rowAge}>
              Ocular age: <Text style={[s.rowAgeVal, { color }]}>{scan.predicted_age.toFixed(1)} yrs</Text>
            </Text>
          )}
        </View>
        <View style={[s.riskBadge, { backgroundColor: `${color}18` }]}>
          <Text style={[s.riskTxt, { color }]}>{level.charAt(0).toUpperCase() + level.slice(1)}</Text>
        </View>
      </Card>
    </TouchableOpacity>
  );
}

function TrendChart({ data }) {
  const ages   = data.map(d => d.predicted_age);
  const minAge = Math.min(...ages) - 2;
  const maxAge = Math.max(...ages) + 2;
  const range  = maxAge - minAge || 1;
  const innerW = CHART_W - PAD.l - PAD.r;
  const innerH = CHART_H - PAD.t - PAD.b;

  const pts = data.map((d, i) => ({
    x: PAD.l + (i / Math.max(data.length - 1, 1)) * innerW,
    y: PAD.t + (1 - (d.predicted_age - minAge) / range) * innerH,
    age: d.predicted_age,
  }));

  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const cp1x = pts[i-1].x + (pts[i].x - pts[i-1].x) / 3;
    const cp2x = pts[i].x   - (pts[i].x - pts[i-1].x) / 3;
    d += ` C ${cp1x} ${pts[i-1].y} ${cp2x} ${pts[i].y} ${pts[i].x} ${pts[i].y}`;
  }

  return (
    <Svg width={CHART_W} height={CHART_H}>
      <Line x1={PAD.l} y1={PAD.t + innerH/2} x2={PAD.l + innerW} y2={PAD.t + innerH/2}
        stroke={T.border} strokeWidth={1} strokeDasharray="4 4" />
      <SvgText x={PAD.l - 4} y={PAD.t + 4} fill={T.faint} fontSize={9} textAnchor="end">{Math.round(maxAge)}</SvgText>
      <SvgText x={PAD.l - 4} y={PAD.t + innerH + 4} fill={T.faint} fontSize={9} textAnchor="end">{Math.round(minAge)}</SvgText>
      <Path d={d} stroke={T.sage} strokeWidth={2.5} fill="none" strokeLinecap="round" />
      {pts.map((p, i) => (
        <Circle key={i} cx={p.x} cy={p.y} r={4} fill={T.sage} stroke={T.bgDeep} strokeWidth={1.5} />
      ))}
    </Svg>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: T.bgDeep },
  list:   { paddingHorizontal: 20, paddingBottom: 120 },
  heading:{ fontFamily: T.display, fontSize: 32, color: T.white, marginTop: 24, marginBottom: 18 },
  chartCard: { padding: 16, marginBottom: 16 },
  chartTitle:{ fontFamily: T.bodySemi, fontSize: 11, color: T.sage, letterSpacing: 1, marginBottom: 10 },
  row:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, marginBottom: 10 },
  rowLeft:{ flex: 1 },
  rowDate:{ fontFamily: T.bodyMed, fontSize: 14, color: T.white, marginBottom: 4 },
  rowAge: { fontFamily: T.body,    fontSize: 13, color: T.muted  },
  rowAgeVal:{ fontFamily: T.bodyMed },
  riskBadge:{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14 },
  riskTxt:  { fontFamily: T.bodySemi, fontSize: 12, letterSpacing: 0.4 },
  empty:   { alignItems: 'center', paddingVertical: 64, paddingHorizontal: 32, gap: 14 },
  emptyIco: { fontSize: 40, color: T.sage },
  emptyTitle:{ fontFamily: T.bodyMed, fontSize: 18, color: T.white },
  emptyBody: { fontFamily: T.body, fontSize: 14, color: T.muted, textAlign: 'center', lineHeight: 22 },
  errTxt: { fontFamily: T.body, fontSize: 14, color: T.error, textAlign: 'center', marginTop: 24 },
});
