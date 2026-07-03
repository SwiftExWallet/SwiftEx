import React, { useState, useEffect, useRef } from "react";
import { PanResponder, Animated, StyleSheet, Dimensions, View, ActivityIndicator } from 'react-native';
import Icon from "react-native-vector-icons/FontAwesome";

const SCREEN_WIDTH = Dimensions.get('window').width;
const TRACK_WIDTH = SCREEN_WIDTH - 80;
const THUMB_SIZE = 52;
const MAX_SLIDE = TRACK_WIDTH - THUMB_SIZE - 8;

const DragToProcced = ({ onDragComplete, disabled, isProccessing, heading }) => {
    const translateX = useRef(new Animated.Value(0)).current;
    const [claimed, setClaimed] = useState(false);
    const currentX = useRef(0);
    const startX = useRef(0);
    const disabledRef = useRef(disabled);
    const isProccessingRef = useRef(isProccessing);
    useEffect(() => { disabledRef.current = disabled; }, [disabled]);
    useEffect(() => { isProccessingRef.current = isProccessing; }, [isProccessing]);

    useEffect(() => {
        const listener = translateX.addListener(({ value }) => {
            currentX.current = value;
        });
        return () => translateX.removeListener(listener);
    }, [translateX]);

    const onDragCompleteRef = useRef(onDragComplete);
    useEffect(() => {
        onDragCompleteRef.current = onDragComplete;
    }, [onDragComplete]);

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => !disabledRef.current && !isProccessingRef.current,
            onMoveShouldSetPanResponder: () => !disabledRef.current && !isProccessingRef.current,
            onPanResponderGrant: () => {
                startX.current = currentX.current;
            },
            onPanResponderMove: (_, gestureState) => {
                let nextX = startX.current + gestureState.dx;
                if (nextX < 0) nextX = 0;
                if (nextX > MAX_SLIDE) nextX = MAX_SLIDE;
                translateX.setValue(nextX);
            },
            onPanResponderRelease: () => {
                if (currentX.current >= MAX_SLIDE * 0.85) {
                    Animated.timing(translateX, {
                        toValue: MAX_SLIDE,
                        duration: 150,
                        useNativeDriver: false,
                    }).start(() => {
                        if (!claimed) {
                            setClaimed(true);
                            onDragCompleteRef.current?.();
                        }
                    });
                } else {
                    Animated.spring(translateX, {
                        toValue: 0,
                        tension: 50,
                        friction: 7,
                        useNativeDriver: false,
                    }).start();
                }
            },
        })
    ).current;

    useEffect(() => {
        if (!isProccessing && claimed) {
            setClaimed(false);
            Animated.spring(translateX, {
                toValue: 0,
                tension: 50,
                friction: 7,
                useNativeDriver: false
            }).start();
        }
    }, [isProccessing, claimed]);

    const labelOpacity = translateX.interpolate({
        inputRange: [0, MAX_SLIDE * 0.4],
        outputRange: [1, 0],
        extrapolate: 'clamp',
    });

    const fillWidth = translateX.interpolate({
        inputRange: [0, MAX_SLIDE],
        outputRange: [THUMB_SIZE + 8, TRACK_WIDTH],
        extrapolate: 'clamp',
    });

    return (
        <View style={[sliderStyles.track, { opacity: disabled ? 0.5 : 1 }]}>
            <Animated.View style={[sliderStyles.fill, { width: fillWidth }]} />
            <Animated.Text style={[sliderStyles.label, { opacity: labelOpacity }]} numberOfLines={1}>
                {isProccessing ? 'Wait...' : `${heading || ''}`}
            </Animated.Text>

            <Animated.View
                style={[sliderStyles.thumb, { transform: [{ translateX }] }]}
                {...panResponder.panHandlers}
            >
                {isProccessing ? (
                    <ActivityIndicator size="small" color="#FFF" />
                ) : (
                    <Icon name="chevron-right" size={20} color="#FFF" />
                )}
            </Animated.View>
        </View>
    );
};

const sliderStyles = StyleSheet.create({
    track: {
        width: TRACK_WIDTH,
        height: 60,
        borderRadius: 30,
        backgroundColor: 'rgba(64,82,214,0.12)',
        justifyContent: 'center',
        alignItems: 'flex-start',
        overflow: 'hidden',
        position: 'relative',
    },
    fill: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        backgroundColor: '#4052D6',
        borderRadius: 30,
    },
    label: {
        position: 'absolute',
        width: '100%',
        textAlign: 'center',
        fontSize: 14,
        fontWeight: '600',
        color: '#4052D6',
        paddingHorizontal: THUMB_SIZE + 10,
    },
    thumb: {
        position: 'absolute',
        left: 4,
        width: THUMB_SIZE,
        height: THUMB_SIZE,
        borderRadius: THUMB_SIZE / 2,
        backgroundColor: '#4052D6',
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 4,
        shadowColor: '#4052D6',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 6,
    },
});

export default DragToProcced;