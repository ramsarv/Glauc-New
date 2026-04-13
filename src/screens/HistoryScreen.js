/**
 * HistoryScreen — List of past scans with a simple age trend chart.
 * Fetches paginated history from /history and plots with react-native-svg.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, RefreshControl, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle, Line, Text as SvgText } from 'react-native-svg';
import { T, RISK_COLORS } from '../constants/theme';
import Card from '../components/Card';
import { apiGetHistory } from '../services/api';

const { width: SCREEN_W } = Dimensions.get('window');
const CHART_W = SCREEN_W - 48;  // 24px padding each side
const CHART_H = 110;
const CHART_PAD = { left: 36, right: 16, top: 12, bottom: 28 };

export default function HistoryScreen({ navigation }) {
  const [scans,      setScans]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error,      setError]      = useState(null);
  const [page,       setPage]       = useState(0);
  const [hasMore,    setHasMore]    = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  const fetchHistory = useCallback(async (pageNum = 0, append = false) => {
    try {
      const data = await apiGetHistory(pageNum);
      if (!mountedRef.current) return;
      const items = data.results || data.history || [];
      setScans(prev => append ? [...prev, ...items] : items);
      setHasMore(items.length > 0 && (data.has_more ?? items.length === 50));
      setPage(pageNum);
      setError(null);
    } catch (err) {
      if (mountedRef.current) setError(err.message);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchHistory(0, false);
      setLoading(false);
    })();
  }, [fetchHistory]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchHistory(0, false);
    setRefreshing(false);
  }, [fetchHistory]);

  const onEndReached = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    await fetchHistory(page + 1, true);
    setLoadingMore(false);
  }, [loadingMore, hasMore, page, fetchHistory]);

  // ── Chart data ──────────────────────────────────────────────
  const chartData = scans
    .filter(s => s.predicted_age != null)
    .slice()
    .reverse()
    .slice(-12); // last 12 scans

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <LinearGradient
        colors={[`${T.amber}10`, T.obsidian]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.4 }}
        style={StyleSheet.absoluteFill}
      />

      <FlatList
        data={scans}
        keyExtractor={(item, i) => item.session_id || item.id || String(i)}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.amber} />
        }
        onEndReached={onEndReached}
        onEndReachedThreshold={0.3}
        ListHeaderComponent={() => (
          <View>
            <Text style={styles.heading}>Scan History</Text>

            {/* Trend chart */}
            {chartData.length >= 2 && (
              <Card style={styles.chartCard}>
                <Text style={styles.chartTitle}>Ocular Age Trend</Text>
                <TrendChart data={chartData} />
              </Card>
            )}

            {loading && (
              <ActivityIndicator color={T.amber} size="large" style={{ marginTop: 40 }} />
            )}
            {!loading && error && (
              <Text style={styles.errorText}>{error}</Text>
            )}
            {!loading && !error && scans.length === 0 && (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyIcon}>👁</Text>
                <Text style={styles.emptyTitle}>No scans yet</Text>
                <Text style={styles.emptyBody}>
                  Complete your first eye scan to start tracking your ocular health.
                </Text>
              </View>
            )}
          </View>
        )}
        renderItem={({ item }) => (
          <ScanRow
            scan={item}
            onPress={() => navigation.navigate('Results', { result: item })}
          />
        )}
        ListFooterComponent={() =>
          loadingMore ? <ActivityIndicator color={T.amber} style={{ marginVertical: 16 }} /> : null
        }
      />
    </SafeAreaView>
  );
}

// ── Scan list row ─────────────────────────────────────────────
function ScanRow({ scan, onPress }) {
  const riskLevel = scan.risk_level?.toLowerCase() || 'low';
  const riskColor = RISK_COLORS[riskLevel] || T.teal;
  const date = scan.timestamp
    ? new Date(scan.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'Unknown date';

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={`Scan from ${date}`}
    >
      <Card style={styles.scanRow}>
        <View style={styles.scanLeft}>
          <Text style={styles.scanDate}>{date}</Text>
          {scan.predicted_age != null && (
            <Text style={styles.scanAge}>
              Ocular age: <Text style={styles.scanAgeVal}>{scan.predicted_age.toFixed(1)} yrs</Text>
            </Text>
          )}
        </View>
        <View style={[styles.riskBadge, { backgroundColor: `${riskColor}20` }]}>
          <Text style={[styles.riskText, { color: riskColor }]}>
            {riskLevel.charAt(0).toUpperCase() + riskLevel.slice(1)}
          </Text>
        </View>
      </Card>
    </TouchableOpacity>
  );
}

// ── SVG trend line chart ──────────────────────────────────────
function TrendChart({ data }) {
  const ages = data.map(d => d.predicted_age);
  const minAge = Math.min(...ages) - 2;
  const maxAge = Math.max(...ages) + 2;
  const range  = maxAge - minAge || 1;

  const innerW = CHART_W - CHART_PAD.left - CHART_PAD.right;
  const innerH = CHART_H - CHART_PAD.top - CHART_PAD.bottom;

  const pts = data.map((d, i) => ({
    x: CHART_PAD.left + (i / (data.length - 1)) * innerW,
    y: CHART_PAD.top  + (1 - (d.predicted_age - minAge) / range) * innerH,
    age: d.predicted_age,
  }));

  // SVG smooth path
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const cp1x = pts[i - 1].x + (pts[i].x - pts[i - 1].x) / 3;
    const cp1y = pts[i - 1].y;
    const cp2x = pts[i].x     - (pts[i].x - pts[i - 1].x) / 3;
    const cp2y = pts[i].y;
    d += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${pts[i].x} ${pts[i].y}`;
  }

  return (
    <Svg width={CHART_W} height={CHART_H}>
      {/* Horizontal gridline */}
      <Line
        x1={CHART_PAD.left} y1={CHART_PAD.top + innerH / 2}
        x2={CHART_PAD.left + innerW} y2={CHART_PAD.top + innerH / 2}
        stroke={T.border} strokeWidth={1} strokeDasharray="4 4"
      />
      {/* Y axis labels */}
      <SvgText x={CHART_PAD.left - 4} y={CHART_PAD.top + 4}
        fill={T.creamLow} fontSize={9} textAnchor="end">
        {Math.round(maxAge)}
      </SvgText>
      <SvgText x={CHART_PAD.left - 4} y={CHART_PAD.top + innerH + 4}
        fill={T.creamLow} fontSize={9} textAnchor="end">
        {Math.round(minAge)}
      </SvgText>

      {/* Trend line */}
      <Path d={d} stroke={T.amber} strokeWidth={2.5} fill="none" strokeLinecap="round" />

      {/* Data points */}
      {pts.map((p, i) => (
        <Circle key={i} cx={p.x} cy={p.y} r={4} fill={T.amber}
          stroke={T.obsidian} strokeWidth={1.5} />
      ))}
    </Svg>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.obsidian },
  list: { paddingHorizontal: 20, paddingBottom: 120 },

  heading: {
    fontFamily: T.display,
    fontSize: 30,
    color: T.cream,
    marginTop: 20,
    marginBottom: 16,
  },

  chartCard: { padding: 16, marginBottom: 16 },
  chartTitle: {
    fontFamily: T.bodyMed,
    fontSize: 13,
    color: T.creamMid,
    letterSpacing: 0.4,
    marginBottom: 12,
  },

  scanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 10,
  },
  scanLeft: { flex: 1 },
  scanDate: {
    fontFamily: T.bodyMed,
    fontSize: 14,
    color: T.cream,
    marginBottom: 4,
  },
  scanAge: {
    fontFamily: T.body,
    fontSize: 12,
    color: T.creamMid,
  },
  scanAgeVal: {
    color: T.amber,
    fontFamily: T.bodyMed,
  },

  riskBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
  },
  riskText: {
    fontFamily: T.bodySemi,
    fontSize: 12,
    letterSpacing: 0.4,
  },

  emptyBox: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyIcon:  { fontSize: 40 },
  emptyTitle: {
    fontFamily: T.bodyMed,
    fontSize: 18,
    color: T.cream,
  },
  emptyBody: {
    fontFamily: T.body,
    fontSize: 14,
    color: T.creamMid,
    textAlign: 'center',
    lineHeight: 22,
  },

  errorText: {
    fontFamily: T.body,
    fontSize: 14,
    color: T.red,
    textAlign: 'center',
    marginTop: 24,
  },
});
