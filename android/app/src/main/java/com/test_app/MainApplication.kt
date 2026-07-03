package org.app.swiftEx.wallet

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.facebook.react.defaults.DefaultReactNativeHost
import com.facebook.soloader.SoLoader
import com.google.firebase.FirebaseApp // Import FirebaseApp
import org.app.swiftEx.wallet.ethwallet.EthereumWalletPackage
import java.security.Security
import org.bouncycastle.jce.provider.BouncyCastleProvider
import com.stallion.Stallion
class MainApplication : Application(), ReactApplication {

   companion object {
    init {
      // Setting up BouncyCastle provider for cryptographic operations
      Security.removeProvider("BC")
      Security.addProvider(BouncyCastleProvider())
    }
  }

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
            PackageList(this).packages.apply {
              // Packages that cannot be autolinked yet can be added manually here, for example:
              // add(MyReactNativePackage())
              add(EthereumWalletPackage())
              add(walletTransactionPackage())
             // add(PlayIntegrityPackage())
            },
      jsBundleFilePath = Stallion.getJSBundleFile(applicationContext)
    )}       

  override fun onCreate() {
    super.onCreate()
    // this ApplicationVerification fist validate app than execute next
  //  ApplicationVerification.run(applicationContext)
    // Initialize Firebase
    FirebaseApp.initializeApp(this)  // Add this line to initialize Firebase
    loadReactNative(this)
  }
}
