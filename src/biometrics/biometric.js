import ReactNativeBiometrics, { BiometryTypes } from 'react-native-biometrics'
import AsyncStorageLib from "@react-native-async-storage/async-storage";

const rnBiometrics = new ReactNativeBiometrics({
  allowDeviceCredentials: true
})

export function enableBiometrics(){
    rnBiometrics.simplePrompt({promptMessage: 'Confirm fingerprint'})
  .then((resultObject) => {
    const { success } = resultObject

    if (success) {
      console.log('successful biometrics provided')
      AsyncStorageLib.setItem('Biometric', 'SET')
      
    } else {
      console.log('user cancelled biometric prompt')
    }
  })
  .catch(() => {
    console.log('biometrics failed')
  })
}
export function enable_face_id(){
  rnBiometrics.simplePrompt({promptMessage: 'Confirm fingerprint'})
.then((resultObject) => {
  const { success } = resultObject

  if (success) {
    console.log('successful biometrics provided')
    AsyncStorageLib.setItem('Biometric', 'SET')
    
  } else {
    console.log('user cancelled biometric prompt')
  }
})
.catch(() => {
  console.log('biometrics failed')
})
}

export function useBiometrics(navigation){ 
    rnBiometrics.simplePrompt({promptMessage: 'Confirm fingerprint'})
  .then((resultObject) => {
    const { success } = resultObject

    if (success) {
      console.log('successful biometrics provided')
      navigation.navigate('HomeScreen')
    } else {
      console.log('user cancelled biometric prompt')
    }
  })
  .catch(() => {
    console.log('biometrics failed')
  })
}

export async function useBiometrics_run() {
  try {
    const result = await rnBiometrics.simplePrompt({ promptMessage: 'Confirm fingerprint' })
    if (result.success) {
      console.log('successful biometrics provided')
      return true
    }
    if (result.error) {
      return false
    }
  } catch (error) {
    return false
  }
}

export function useBiometricsForAppLock(navigation){ 
  rnBiometrics.simplePrompt({promptMessage: 'Confirm fingerprint'})
.then((resultObject) => {
  const { success } = resultObject

  if (success) {
    console.log('successful biometrics provided')
    navigation.goBack()
  } else {
    console.log('user cancelled biometric prompt')
  }
})
.catch(() => {
  console.log('biometrics failed')
})
}


export function getBiometrics(){

    rnBiometrics.isSensorAvailable()
    .then((resultObject) => {
        const { available, biometryType } = resultObject
        
        if (available && biometryType === BiometryTypes.TouchID) {
            console.log('TouchID is supported')
        } else if (available && biometryType === BiometryTypes.FaceID) {
            console.log('FaceID is supported')
            enable_face_id()
        } else if (available && biometryType === BiometryTypes.Biometrics) {
            console.log('Biometrics is supported')
            enableBiometrics()
        } else {
            console.log('Biometrics not supported')
            
        }
    })
}

export function useBiometricsForSendTransaction(Function){ 
  rnBiometrics.simplePrompt({promptMessage: 'Confirm fingerprint'})
.then((resultObject) => {
  const { success } = resultObject

  if (success) {
    console.log('successful biometrics provided')
    //navigation.goBack()
    Function()
  } else {
    console.log('user cancelled biometric prompt')
  }
})
.catch(() => {
  console.log('biometrics failed')
})
}

export async function useBiometricsForSwapTransaction(Function){ 
  rnBiometrics.simplePrompt({promptMessage: 'Confirm fingerprint'})
.then(async (resultObject) => {
  const { success } = resultObject

  if (success) {
    console.log('successful biometrics provided')
    //navigation.goBack()
    await Function()
  } else {
    console.log('user cancelled biometric prompt')
  }
})
.catch(() => {
  console.log('biometrics failed')
})
}


export function turnOffBiometrics(){
    AsyncStorageLib.setItem('Biometric', 'UNSET')

}