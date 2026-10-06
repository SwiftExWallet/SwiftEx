import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';

export function Wallet_market_loading () {
    const shimmerAnimation = useRef(new Animated.Value(0)).current;
    const obje=[0,1,2,3,4,5,6,7,8,9];
  
    useEffect(() => {
      const startShimmer = () => {
        Animated.loop(
          Animated.sequence([
            Animated.timing(shimmerAnimation, {
              toValue: 1,
              duration: 1000,
              useNativeDriver: true,
            }),
            Animated.timing(shimmerAnimation, {
              toValue: 0,
              duration: 1000,
              useNativeDriver: true,
            }),
          ])
        ).start();
      };
  
      startShimmer();
    }, []);
  
    const shimmerTranslateX = shimmerAnimation.interpolate({
      inputRange: [0, 1],
      outputRange: [-200, 200],
    });
  
  return (
    <>
      {obje.map((list,index) => {
        return (
          <View style={styles.Wallet_container}>
            <View style={styles.loadCircle}>
              <Animated.View
                style={[
                  styles.shimmer,
                  { transform: [{ translateX: shimmerTranslateX }] },
                ]}
              />
            </View>
            <View style={{flexDirection:"row",justifyContent:"space-around",width:"88%"}}>
              <View style={{width:"46%"}}>
              <View style={[styles.Wallet_loadBlock,{ width:"62%",}]}>
                <Animated.View
                  style={[
                    styles.shimmer,
                    { transform: [{ translateX: shimmerTranslateX }] },
                  ]}
                />
              </View>
              <View style={[styles.WalletLoadSub,{ width:"31%"}]}>
                <Animated.View
                  style={[
                    styles.shimmer,
                    { transform: [{ translateX: shimmerTranslateX }] },
                  ]}
                />
              </View>
            </View>

            <View style={{width:"46%",alignItems:"flex-end"}}>
              <View style={styles.Wallet_loadBlock}>
                <Animated.View
                  style={[
                    styles.shimmer,
                    { transform: [{ translateX: shimmerTranslateX }] },
                  ]}
                />
              </View>
              <View style={styles.WalletLoadSub}>
                <Animated.View
                  style={[
                    styles.shimmer,
                    { transform: [{ translateX: shimmerTranslateX }] },
                  ]}
                />
              </View>
            </View>
            </View>
          </View>
        )
      })}
    </>
  );
};  

const styles = StyleSheet.create({
  Wallet_container:{
    flexDirection:"row",
    alignContent:"center",
    paddingHorizontal:"5%",
    width:"99%",
    marginTop:16
  },
  Wallet_loadBlock:{
    height: 22,
    width:"67%",
    marginHorizontal:10,
    marginVertical:3,
    backgroundColor: 'gray',
    opacity:5,
    borderRadius: 13,
    overflow: 'hidden',
  },
  WalletLoadSub:{
    height: 16,
    width:"44%",
    marginHorizontal:10,
    marginVertical:3,
    backgroundColor: 'gray',
    opacity:5,
    borderRadius: 13,
    overflow: 'hidden',
  },
  container: {
    padding: 20,
    backgroundColor:"#011434",
    width:"99%"
  },
  loadBlock: {
    height: 29,
    backgroundColor: 'silver',
    borderRadius: 4,
    marginBottom: 10,
    overflow: 'hidden',
  },
  loadCircle: {
    width: 60,
    height: 60,
    backgroundColor: 'gray',
    opacity:5,
    borderRadius: 30,
    overflow: 'hidden',
    alignSelf:"center",
    marginBottom:19
  },
  shimmer: {
    width: 200,
    height: '100%',
    backgroundColor: '#f0f0f0',
    position: 'absolute',
    top: 0,
    left: 0,
    opacity: 0.5,
  }
});