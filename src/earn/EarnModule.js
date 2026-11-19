import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {View, StyleSheet, BackHandler} from 'react-native';
import earnScreens from './screens';
import {useVaultColors} from './theme';

export default function EarnModule({initialRoute = 'EarnHome', initialParams, onExit}) {
  const colors = useVaultColors();
  const keyRef = useRef(1);
  const mk = useCallback((name, params) => ({key: `r${keyRef.current++}`, name, params}), []);
  const [stack, setStack] = useState(() => [{key: 'r0', name: initialRoute, params: initialParams}]);
  const stackRef = useRef(stack);
  stackRef.current = stack;
  const exitRef = useRef(onExit);
  exitRef.current = onExit;

  const navigation = useMemo(
    () => ({
      navigate: (name, params) =>
        setStack(s => {
          let idx = -1;
          for (let i = s.length - 1; i >= 0; i--) {
            if (s[i].name === name) {
              idx = i;
              break;
            }
          }
          if (idx === -1) return [...s, mk(name, params)];
          const next = s.slice(0, idx + 1);
          if (params) next[idx] = {...next[idx], params: {...(next[idx].params || {}), ...params}};
          return next;
        }),
      push: (name, params) => setStack(s => [...s, mk(name, params)]),
      replace: (name, params) => setStack(s => [...s.slice(0, -1), mk(name, params)]),
      goBack: () => {
        if (stackRef.current.length > 1) setStack(s => s.slice(0, -1));
        else if (exitRef.current) exitRef.current();
      },
      popToTop: () => setStack(s => [s[0]]),
      reset: ({routes}) => setStack(routes.map(r => mk(r.name, r.params))),
      canGoBack: () => stackRef.current.length > 1,
      setParams: params =>
        setStack(s => {
          const next = s.slice();
          const last = next[next.length - 1];
          next[next.length - 1] = {...last, params: {...(last.params || {}), ...params}};
          return next;
        }),
    }),
    [mk],
  );

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stackRef.current.length > 1) {
        navigation.goBack();
        return true;
      }
      if (exitRef.current) {
        exitRef.current();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [navigation]);

  const top = stack.length - 1;

  return (
    <View style={[styles.root, {backgroundColor: colors.bg}]}>
      {stack.map((r, i) => {
        const Comp = earnScreens[r.name];
        if (!Comp) return null;
        return (
          <View key={r.key} style={[StyleSheet.absoluteFill, i !== top && styles.hidden]} pointerEvents={i === top ? 'auto' : 'none'}>
            <Comp navigation={navigation} route={{key: r.key, name: r.name, params: r.params}} />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  hidden: {display: 'none'},
});
