import React, { useEffect, useRef, useState } from 'react';
import {
    View,
    StyleSheet,
    BackHandler,
    TouchableOpacity,
    Text,
    PanResponder,
    ActivityIndicator,
    Platform,
    Animated,
} from 'react-native';
import { WebView } from 'react-native-webview';
import {
    widthPercentageToDP as wp,
    heightPercentageToDP as hp,
} from "react-native-responsive-screen";
import Icon from '../src/icon';
import CustomInfoProvider from '../src/Dashboard/exchange/crypto-exchange-front-end-main/src/components/CustomInfoProvider';

const FloatingScreen = ({ uri, visible, onClose }) => {
    const [isMinimized, setIsMinimized] = useState(false);
    const [loading, setLoading] = useState(true);
    const [showControls, setShowControls] = useState(true);
    const pos = useRef(new Animated.ValueXY({ x: 50, y: 50 })).current;
    const backHandler = useRef(null);
    const webViewRef = useRef(null);

    useEffect(() => {
    if (visible) {
        backHandler.current = BackHandler.addEventListener('hardwareBackPress', () => {
            if (isMinimized) {
               CustomInfoProvider.show("Info", "Do you want to exit?", [
                    { text: "Cancel", style: "cancel" },
                    { text: "Yes", onPress: onClose },
                ]);
            } else {
                handleHeaderBack();
            }
            return true;
        });
    }

    return () => {
        if (backHandler.current) backHandler.current.remove();
    };
}, [visible, isMinimized]);

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onPanResponderGrant: () => {
                pos.setOffset({ x: pos.x._value, y: pos.y._value });
                pos.setValue({ x: 0, y: 0 });
            },
            onPanResponderMove: Animated.event([null, { dx: pos.x, dy: pos.y }], {
                useNativeDriver: false,
            }),
            onPanResponderRelease: () => pos.flattenOffset(),
        })
    ).current;

    const toggleSize = () => setIsMinimized(prev => !prev);

    const handleHeaderBack = () => {
       CustomInfoProvider.show("Info", "Do you want to minimise this screen?", [
            { text: "Exit", onPress: onClose, style: "cancel" },
            { text: "Yes", onPress: () => { setIsMinimized(true); setShowControls(true); } },
            { text: "Cancel", style: "cancel" },
        ]);
    };

    const handleClosePress = () => {
       CustomInfoProvider.show("Info", "Do you want to Exit?", [
            { text: "Cancel", style: "cancel" },
            { text: "Yes", onPress: onClose },
        ]);
    };

    if (!visible) return null;

    const getTruncatedUrl = (url) => {
        if (!url) return '';
        const maxLength = 60;
        if (url.length <= maxLength) return url;
        return url.substring(0, maxLength) + '...';
    };

    const ComponetHeader = ({ title, url }) => {
        return (
            <View style={styles.topHeaderContainer}>
                <TouchableOpacity style={styles.iconButton} onPress={handleHeaderBack}>
                    <Icon name="arrow-left" type="materialCommunity" size={30} color="black" />
                </TouchableOpacity>
                
                <View style={styles.headerTextContainer}>
                    <Text style={styles.headerTitle}>{title}</Text>
                    {url && (
                        <Text style={styles.urlText} numberOfLines={1} ellipsizeMode="tail">
                            {getTruncatedUrl(url)}
                        </Text>
                    )}
                </View>
            </View>
        );
    };

    return (
        <View style={styles.container} pointerEvents={isMinimized ? 'box-none' : 'auto'}>
            <View
                pointerEvents={isMinimized ? 'none' : 'auto'}
                style={[
                    styles.webviewWrapper,
                    isMinimized ? styles.webviewHidden : styles.webviewVisible,
                ]}
            >
                <WebView
                    ref={webViewRef}
                    source={{ uri }}
                    style={styles.webview}
                    onLoad={() => setLoading(false)}
                    onError={() => setLoading(false)}
                    automaticallyAdjustContentInsets={true}
                    contentInsetAdjustmentBehavior="automatic"
                    scalesPageToFit={false}
                    keyboardDisplayRequiresUserAction={false}
                />
                {loading && (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color="green" />
                        <Text style={styles.loadingText}>Collecting Details...</Text>
                    </View>
                )}
            </View>
            {!isMinimized && <ComponetHeader title="Details" url={uri} />}
            {isMinimized && (
                <Animated.View
                    style={[styles.minimized, { transform: pos.getTranslateTransform() }]}
                    {...panResponder.panHandlers}
                >
                    <View style={styles.minimizedContent}>
                        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                            <Icon name="information" type="materialCommunity" size={40} color="#333" />
                        </View>

                        {showControls && (
                            <View style={styles.controlsOverlay} pointerEvents="box-none">
                                <View style={styles.controls}>
                                    <TouchableOpacity onPress={toggleSize} style={styles.button}>
                                        <Icon name="fullscreen" type="materialCommunity" size={25} color="black" />
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={handleClosePress} style={styles.button}>
                                        <Icon name="close-circle-outline" type="materialCommunity" size={25} color="black" />
                                    </TouchableOpacity>
                                </View>
                            </View>
                        )}
                    </View>
                </Animated.View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 999,
    },
    minimized: {
        position: 'absolute',
        width: 200,
        height: 150,
        backgroundColor: '#f5f5f5',
        borderRadius: 10,
        overflow: 'hidden',
        zIndex: 1000,
        elevation: 5,
        shadowColor: "#000",
        shadowOpacity: 0.2,
        shadowOffset: { width: 0, height: 2 },
        shadowRadius: 4,
    },
    minimizedContent: {
        flex: 1,
    },
    controlsOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'flex-start',
        alignItems: 'flex-end',
        padding: 5,
        zIndex: 1000,
    },
    controls: {
        flexDirection: 'row',
        borderRadius: 8,
        padding: 5,
        elevation: 4,
    },
    button: {
        marginHorizontal: 2,
        padding: 2,
    },
    webviewWrapper: {
        position: 'absolute',
        top: Platform.OS === 'ios' ? hp(12) : hp(10),
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#fff',
    },
    webviewVisible: {
        zIndex: 1,
        opacity: 1,
    },
    webviewHidden: {
        zIndex: -1,
        opacity: 0,
    },
    webview: {
        marginTop:Platform.OS==="ios"?hp(4):hp(0),
        height: '100%',
        width: '100%',
    },
    loadingContainer: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#011434',
    },
    loadingText: {
        marginTop: 10,
        fontSize: 16,
        color: "#fff"
    },
    topHeaderContainer: {
        height: Platform.OS === 'ios' ? hp(17.9) : hp(10.5),
        width: wp(100),
        flexDirection: "row",
        alignItems: "center",
        paddingTop: Platform.OS === 'ios' ? hp(11) : hp(3),
        paddingHorizontal: 15,
        position: "absolute",
        top: 0,
        backgroundColor: "#F4F4F8",
        zIndex: 999,
    },
    iconButton: {
        padding: 1,
        marginRight:5,
    },
    headerTextContainer: {
        flex: 1,
        justifyContent: 'center',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '500',
        color: 'black',
    },
    urlText: {
        fontSize: 15,
        color: 'gray',
        marginTop: hp(0.3),
    },
});

export default FloatingScreen;