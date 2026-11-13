import { useEffect, useMemo, useState } from "react";
import {
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSelector } from "react-redux";
import { Wallet_screen_header } from "../../Dashboard/reusables/ExchangeHeader";
import { useNavigation } from "@react-navigation/native";
import { SERVICE_SCREEN_MAP } from "./AppCheckService";

const PALETTES = {
    dark: {
        bg: "#09090B",
        card: "#19191D",
        cardAlt: "#0F0F12",
        border: "#242429",
        divider: "#29292F",
        text: "#F2F2F4",
        textStrong: "#F5F5F7",
        textMid: "#E7E7EA",
        label: "#A0A0A9",
        muted: "#777781",
        faint: "#6F6F78",
        green: "#00D99A",
        yellow: "#FFC400",
        red: "#FF2D5D",
        redText: "#FF5578",
        unknown: "#999999",
        errorBg: "#19191D",
        errorBorder: "#33202A",
        errorText: "#FF708E",
        badgeBorder: "#075E49",
        badgeBg: "#08261F",
        webBorder: "#075C73",
        webBg: "#08232C",
        webText: "#00BDEB",
    },
    light: {
        bg: "#F5F6FA",
        card: "#FFFFFF",
        cardAlt: "#F0F1F6",
        border: "#E3E5EC",
        divider: "#E8EAF0",
        text: "#0B0C10",
        textStrong: "#0B0C10",
        textMid: "#1F2230",
        label: "#5A5F70",
        muted: "#6B7080",
        faint: "#8A8F9C",
        green: "#059669",
        yellow: "#D97706",
        red: "#E11D48",
        redText: "#E11D48",
        unknown: "#8A8F9C",
        errorBg: "#FFF1F3",
        errorBorder: "#FBCFD8",
        errorText: "#BE123C",
        badgeBorder: "#A7F3D0",
        badgeBg: "#ECFDF5",
        webBorder: "#A5E8F6",
        webBg: "#ECFEFF",
        webText: "#0891B2",
    },
};

const styleCache = {};
const getStyles = (isDark) => {
    const key = isDark ? "dark" : "light";
    if (!styleCache[key]) {
        styleCache[key] = createStyles(PALETTES[key]);
    }
    return styleCache[key];
};

const useTheme = () => {
    const isDark = useSelector((state) => state.THEME.THEME);
    const p = isDark ? PALETTES.dark : PALETTES.light;
    const styles = useMemo(() => getStyles(isDark), [isDark]);
    return { isDark, p, styles };
};

const SERVICE_LABELS = {
    "eth-swap": "EVM Token Swap",
    home: "Core Exchange Gateway",
    new_offer: "Orderbook & Limit Orders",
    portfolio: "Portfolio & Asset Valuation",
    sdex: "Stellar DEX (SDEX)",
    send_receive: "Multi-Chain Deposit & Transfer",
    send_xlm: "Native XLM Transfers",
    swap: "Instant Cross-Chain Swap",
};

const DEFAULT_DATA = {
    countryCode: null,
    countryName: null,
    isRestricted: false,
    services: [],
    appVersion: {
        android: {
            latestVersion: "—",
            minimumSupportedVersion: "—",
        },
        ios: {
            latestVersion: "—",
            minimumSupportedVersion: "—",
        },
    },
};

const getStatusMeta = (status, p) => {
    const key = String(status || "").toLowerCase();
    const map = {
        operational: { label: "Operational", color: p.green },
        degraded: { label: "Degraded", color: p.yellow },
        maintenance: { label: "Maintenance", color: p.yellow },
        down: { label: "Offline", color: p.red },
        offline: { label: "Offline", color: p.red },
    };
    return map[key] || { label: status || "Unknown", color: p.unknown };
};

const formatTimeAgo = (dateString) => {
    if (!dateString) {
        return "—";
    }
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) {
        return "—";
    }
    const diff = Math.max(0, Date.now() - date.getTime());
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) {
        return `${days}d ago`;
    }
    if (hours > 0) {
        return `${hours}h ago`;
    }
    if (minutes > 0) {
        return `${minutes}m ago`;
    }
    return "Just now";
};

const StatusDot = ({ color }) => {
    const { styles } = useTheme();
    return (
        <View style={[styles.statusDot, { backgroundColor: color }]} />
    );
};

const SummaryBar = ({ services }) => {
    const { p, styles } = useTheme();

    const counts = useMemo(() => {
        let active = 0;
        let maintenance = 0;
        let offline = 0;

        services.forEach((service) => {
            const status = String(service.status || "").toLowerCase();
            if (status === "operational") {
                active += 1;
            } else if (status === "down" || status === "offline") {
                offline += 1;
            } else {
                maintenance += 1;
            }
        });
        return {
            active,
            maintenance,
            offline,
        };
    }, [services]);
    const overallColor = counts.offline > 0 ? p.red : counts.maintenance > 0 ? p.yellow : p.green;
    return (
        <View style={styles.summaryCard}>
            <View style={styles.summaryMessage}>
                <StatusDot color={overallColor} />
                <Text style={styles.summaryTitle}>Service status update</Text>
            </View>
            <View style={styles.summaryStats}>
                <View style={styles.summaryStat}>
                    <Text style={styles.statNumber}>{Object.keys(SERVICE_SCREEN_MAP).length}</Text>
                    <Text style={styles.statLabel}>Systems</Text>
                </View>
                <View style={styles.summaryStat}>
                    <Text style={[styles.statNumber, styles.green]}>
                        {Math.max(
                            0,
                            Object.keys(SERVICE_SCREEN_MAP || {}).length -
                            (counts?.maintenance || 0) -
                            (counts?.offline || 0)
                        )}
                    </Text>
                    <Text style={styles.statLabel}>Active</Text>
                </View>
                <View style={styles.summaryStat}>
                    <Text style={[styles.statNumber, styles.yellow]}>
                        {counts.maintenance}
                    </Text>
                    <Text style={styles.statLabel}>Maint</Text>
                </View>
                <View style={[styles.summaryStat, styles.lastChild]}>
                    <Text style={[styles.statNumber, styles.red]}>{counts.offline}</Text>
                    <Text style={styles.statLabel}>Offline</Text>
                </View>
            </View>
            <Text style={styles.summaryDetail}>
                {counts.offline} offline, {counts.maintenance} in maintenance
            </Text>
        </View>
    );
};

const JurisdictionCard = ({ data }) => {
    const { p, styles } = useTheme();
    const authorized = !data.isRestricted;
    const location = data.countryName || data.countryCode || "Unknown";
    const accent = authorized ? p.green : p.red;

    return (
        <View style={styles.card}>
            <View style={styles.cardHeader}>
                <Text style={styles.eyebrow}>JURISDICTION & REGIONAL COMPLIANCE</Text>
                <View style={styles.authorized}>
                    <StatusDot color={accent} />
                    <Text style={[styles.authorizedText, { color: accent }]}>
                        {authorized ? "Authorized for use" : "Restricted"}
                    </Text>
                </View>
            </View>
            <View style={styles.separator} />
            <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>Location</Text>
                <Text style={styles.infoValue}>{location}</Text>
            </View>
            <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>Operating Standard</Text>
                <Text style={[styles.infoValue, authorized ? styles.green : styles.red]}>
                    {authorized ? "Full Exchange Clearance" : "Restricted Access"}
                </Text>
            </View>
            <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>Regulatory Framework</Text>
                <Text style={styles.infoValue}>Compliant Geo-Fencing</Text>
            </View>
            <Text style={styles.description}>
                Your territory is {authorized ? "cleared" : "not cleared"} for standard
                wallet connections, swap routing, and decentralized exchange
                features.
            </Text>
        </View>
    );
};

const UptimeBars = ({ status }) => {
    const { p, styles } = useTheme();
    const bars = Array.from({ length: 30 }, (_, index) =>
        index === 29 ? status : "operational",
    );

    return (
        <View style={styles.bars}>
            {bars.map((item, index) => {
                const meta = getStatusMeta(item, p);
                return (
                    <View key={`${index}-${item}`} style={[styles.bar, { backgroundColor: meta.color }]} />
                );
            })}
        </View>
    );
};

const ServiceRow = ({ service }) => {
    const { p, styles } = useTheme();
    const meta = getStatusMeta(service.status, p);
    const serviceName = SERVICE_LABELS[service.id] || service.name || service.id;
    return (
        <View style={styles.serviceRow}>
            <View style={styles.serviceHeader}>
                <View style={styles.serviceTitle}>
                    <Text style={styles.serviceName}>{serviceName}</Text>
                </View>
                <View style={styles.serviceStatus}>
                    <StatusDot color={meta.color} />
                    <Text style={[styles.serviceStatusText, { color: meta.color }]}>{meta.label}</Text>
                </View>
            </View>
            <UptimeBars status={service.status} />
            <View style={styles.serviceFooter}>
                <Text style={styles.serviceMessage} numberOfLines={1}>
                    {service.message || "No status message available"}
                </Text>
                <Text style={styles.timeAgo}>{formatTimeAgo(service.updatedAt)}</Text>
            </View>
        </View>
    );
};

const ServicesCard = ({ services }) => {
    const { styles } = useTheme();
    return (
        <View style={styles.card}>
            <View style={styles.servicesHeader}>
                <Text style={styles.eyebrow}>
                    SERVICES & INFRASTRUCTURE ({services.length})
                </Text>
                <Text style={styles.history}>30-Day History</Text>
            </View>
            {services.map((service, index) => (
                <ServiceRow key={service.id || index} service={service} />
            ))}
        </View>
    );
};

export default function AppStatus() {
    const navi = useNavigation();
    const { p, styles } = useTheme();
    const [data, setData] = useState(DEFAULT_DATA);
    const [error, setError] = useState("");

    const fetchStatus = async () => {
        try {
            setError("");
            const storedStatus = await AsyncStorage.getItem("AppStatusChecks");
            if (!storedStatus) {
                setError("App status data not found");
                return;
            }
            const json = JSON.parse(storedStatus);
            setData((prevData) => ({
                ...prevData,
                ...json,
                services: Array.isArray(json.services) ? json.services : [],
                appVersion: json.appVersion || prevData.appVersion,
            }));
        } catch (err) {
            setError(err?.message || "Unable to load system status");
        }
    };

    useEffect(() => {
        fetchStatus();
    }, []);

    return (
        <View style={styles.safeArea}>
            <Wallet_screen_header elementestID={"appStatus"} title="App Status" onLeftIconPress={() => navi.goBack()} />
            <ScrollView
                style={styles.screen}
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
            >
                {error ? (
                    <View style={styles.error}>
                        <StatusDot color={p.red} />
                        <Text style={styles.errorText}>{error}</Text>
                    </View>
                ) : null}
                <SummaryBar services={data.services} />
                <JurisdictionCard data={data} />
                <ServicesCard services={data.services} />
            </ScrollView>
        </View>
    );
}

function createStyles(p) {
    return StyleSheet.create({
        safeArea: {
            flex: 1,
            backgroundColor: p.bg,
        },
        screen: {
            flex: 1,
            backgroundColor: p.bg,
        },
        content: {
            paddingHorizontal: 16,
            paddingTop: 10,
            paddingBottom: 30,
        },
        header: {
            paddingBottom: 18,
            marginBottom: 18,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: p.border,
        },
        title: {
            color: p.textStrong,
            fontSize: 30,
            lineHeight: 36,
            fontWeight: "700",
            letterSpacing: -0.6,
        },
        subtitle: {
            color: p.muted,
            fontSize: 13,
            lineHeight: 19,
            marginTop: 6,
            maxWidth: 360,
        },
        headerBottom: {
            marginTop: 13,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
        },
        updatedText: {
            color: p.muted,
            fontSize: 10,
            fontFamily: "monospace",
        },
        refreshButton: {
            height: 30,
            paddingHorizontal: 10,
            borderRadius: 6,
            borderWidth: 1,
            borderColor: p.divider,
            flexDirection: "row",
            alignItems: "center",
            gap: 5,
        },
        refreshIcon: {
            color: p.label,
            fontSize: 16,
        },
        refreshText: {
            color: p.label,
            fontSize: 11,
        },
        pressed: {
            opacity: 0.6,
        },
        disabled: {
            opacity: 0.5,
        },
        error: {
            backgroundColor: p.errorBg,
            borderWidth: 1,
            borderColor: p.errorBorder,
            borderRadius: 10,
            padding: 12,
            marginBottom: 16,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
        },
        errorText: {
            color: p.errorText,
            fontSize: 11,
            flex: 1,
        },
        summaryCard: {
            backgroundColor: p.card,
            borderWidth: 1,
            borderColor: p.border,
            borderRadius: 12,
            padding: 14,
            marginBottom: 12,
        },
        summaryMessage: {
            flexDirection: "row",
            alignItems: "center",
            gap: 9,
        },
        summaryTitle: {
            color: p.textMid,
            fontSize: 14,
            fontWeight: "600",
        },
        summaryStats: {
            marginTop: 14,
            flexDirection: "row",
            borderTopWidth: StyleSheet.hairlineWidth,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderColor: p.divider,
            paddingVertical: 12,
        },
        summaryStat: {
            flex: 1,
            alignItems: "center",
            borderRightWidth: StyleSheet.hairlineWidth,
            borderRightColor: p.divider,
        },
        lastChild: {
            borderRightWidth: 0,
        },
        statNumber: {
            color: p.label,
            fontSize: 16,
            fontFamily: "monospace",
            fontWeight: "600",
        },
        statLabel: {
            color: p.muted,
            fontSize: 9,
            marginTop: 3,
            fontFamily: "monospace",
        },
        summaryDetail: {
            color: p.muted,
            fontSize: 10,
            marginTop: 11,
            fontFamily: "monospace",
        },
        green: {
            color: p.green,
        },
        yellow: {
            color: p.yellow,
        },
        red: {
            color: p.redText,
        },
        card: {
            backgroundColor: p.card,
            borderWidth: 1,
            borderColor: p.border,
            borderRadius: 12,
            marginBottom: 10,
            overflow: "hidden",
            paddingVertical:5
        },
        cardHeader: {
            paddingHorizontal: 15,
            paddingVertical: 3,
            gap: 12,
        },
        eyebrow: {
            color: p.muted,
            fontSize: 10,
            fontFamily: "monospace",
            letterSpacing: 1,
            flexShrink: 1,
        },
        separator: {
            height: StyleSheet.hairlineWidth,
            backgroundColor: p.border,
        },
        authorized: {
            flexDirection: "row",
            alignItems: "center",
            gap: 7,
        },
        authorizedText: {
            fontSize: 12,
            fontWeight: "600",
        },
        infoItem: {
            paddingHorizontal: 15,
            paddingTop: 3,
        },
        infoLabel: {
            color: p.faint,
            fontSize: 10,
            fontFamily: "monospace",
            marginBottom: 5,
        },
        infoValue: {
            color: p.text,
            fontSize: 14,
            lineHeight: 20,
        },
        description: {
            color: p.muted,
            fontSize: 11,
            lineHeight: 18,
            padding: 15,
            paddingVertical:2
        },
        statusDot: {
            width: 7,
            height: 7,
            borderRadius: 4,
            flexShrink: 0,
        },
        servicesHeader: {
            paddingHorizontal: 15,
            paddingVertical: 14,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: p.border,
        },
        history: {
            color: p.muted,
            fontSize: 9,
            fontFamily: "monospace",
            flexShrink: 0,
        },
        serviceRow: {
            paddingHorizontal: 15,
            paddingVertical: 15,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: p.border,
        },
        serviceHeader: {
            flexDirection: "row",
            alignItems: "flex-start",
            gap: 8,
        },
        serviceTitle: {
            flex: 1,
            minWidth: 0,
        },
        serviceName: {
            color: p.text,
            fontSize: 13,
            fontWeight: "600",
            lineHeight: 18,
        },
        serviceId: {
            color: p.faint,
            fontSize: 9,
            fontFamily: "monospace",
            marginTop: 2,
        },
        serviceStatus: {
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingTop: 2,
        },
        serviceStatusText: {
            fontSize: 11,
            fontWeight: "600",
        },
        bars: {
            height: 28,
            width: "100%",
            flexDirection: "row",
            alignItems: "stretch",
            gap: 2,
            marginTop: 10,
        },
        bar: {
            flex: 1,
            minWidth: 2,
            borderRadius: 1,
        },
        serviceFooter: {
            marginTop: 8,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
        },
        serviceMessage: {
            color: p.muted,
            fontSize: 9,
            fontFamily: "monospace",
            flex: 1,
            minWidth: 0,
        },
        timeAgo: {
            color: p.muted,
            fontSize: 9,
            fontFamily: "monospace",
            flexShrink: 0,
        },
        protocolHeader: {
            paddingHorizontal: 15,
            paddingVertical: 14,
            gap: 10,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: p.border,
        },
        release: {
            flexDirection: "row",
            alignItems: "center",
            gap: 7,
        },
        releaseText: {
            color: p.green,
            fontSize: 10,
            fontFamily: "monospace",
        },
        versionList: {
            padding: 8,
        },
        versionBox: {
            backgroundColor: p.cardAlt,
            borderRadius: 8,
            padding: 13,
            marginBottom: 8,
        },
        versionHeader: {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
        },
        versionName: {
            color: p.text,
            fontSize: 13,
            fontWeight: "600",
            flex: 1,
        },
        versionBadge: {
            borderRadius: 5,
            borderWidth: 1,
            borderColor: p.badgeBorder,
            backgroundColor: p.badgeBg,
            paddingHorizontal: 8,
            paddingVertical: 4,
        },
        versionBadgeText: {
            color: p.green,
            fontSize: 9,
            fontFamily: "monospace",
            fontWeight: "600",
        },
        webBadge: {
            borderColor: p.webBorder,
            backgroundColor: p.webBg,
        },
        webBadgeText: {
            color: p.webText,
        },
        versionFooter: {
            marginTop: 12,
            flexDirection: "row",
            justifyContent: "space-between",
            gap: 8,
        },
        versionLabel: {
            color: p.faint,
            fontSize: 9,
            fontFamily: "monospace",
        },
        versionValue: {
            color: p.label,
            fontSize: 9,
            fontFamily: "monospace",
        },
    });
}