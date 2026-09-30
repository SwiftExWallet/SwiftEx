package org.app.swiftEx.wallet

import android.app.Activity
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.google.android.play.core.appupdate.AppUpdateManager
import com.google.android.play.core.appupdate.AppUpdateManagerFactory
import com.google.android.play.core.appupdate.AppUpdateOptions
import com.google.android.play.core.install.model.AppUpdateType
import com.google.android.play.core.install.model.UpdateAvailability

class InAppUpdateModule(
    private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

    private val appUpdateManager: AppUpdateManager =
        AppUpdateManagerFactory.create(reactContext)

    override fun getName(): String = "InAppUpdate"

    @ReactMethod
    fun checkForUpdate() {

        appUpdateManager.appUpdateInfo
            .addOnSuccessListener { appUpdateInfo ->

                if (
                    appUpdateInfo.updateAvailability() ==
                    UpdateAvailability.UPDATE_AVAILABLE &&
                    appUpdateInfo.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE)
                ) {

                    // Important fix
                    val activity: Activity =
                        reactApplicationContext.currentActivity
                            ?: return@addOnSuccessListener

                    appUpdateManager.startUpdateFlow(
                        appUpdateInfo,
                        activity,
                        AppUpdateOptions
                            .newBuilder(AppUpdateType.IMMEDIATE)
                            .build()
                    )
                }
            }
            .addOnFailureListener { exception ->
                exception.printStackTrace()
            }
    }
}