package org.app.swiftEx.wallet

import android.app.Dialog
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.text.InputType
import android.text.InputFilter
import android.view.Gravity
import android.view.ViewGroup
import android.view.Window
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import androidx.fragment.app.FragmentActivity

/** Native, masked PIN entry surface. The PIN is returned only to the native caller. */
object NativePinBottomSheet {
    fun show(
        activity: FragmentActivity,
        onSubmit: (String) -> Unit,
        onCancel: () -> Unit,
    ) {
        val dialog = Dialog(activity)
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE)

        val content = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(activity, 24), dp(activity, 20), dp(activity, 24), dp(activity, 24))
            background = GradientDrawable().apply {
                setColor(Color.WHITE)
                cornerRadii = floatArrayOf(24f, 24f, 24f, 24f, 0f, 0f, 0f, 0f)
            }
        }

        val title = TextView(activity).apply {
            text = "Enter app PIN"
            textSize = 20f
            setTextColor(Color.rgb(20, 24, 32))
        }
        val subtitle = TextView(activity).apply {
            text = "Use your app PIN to continue securely."
            textSize = 14f
            setTextColor(Color.rgb(91, 98, 112))
            setPadding(0, dp(activity, 8), 0, dp(activity, 16))
        }
        val input = EditText(activity).apply {
            hint = "6-digit PIN"
            inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD
            filters = arrayOf(InputFilter.LengthFilter(6))
            gravity = Gravity.CENTER
            textSize = 22f
            importantForAutofill = android.view.View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS
        }
        val actions = LinearLayout(activity).apply {
            gravity = Gravity.END
            orientation = LinearLayout.HORIZONTAL
        }
        val cancel = Button(activity).apply {
            text = "Cancel"
            setOnClickListener {
                dialog.dismiss()
                onCancel()
            }
        }
        val submit = Button(activity).apply {
            text = "Continue"
            setOnClickListener {
                val pin = input.text?.toString().orEmpty()
                if (pin.length == 6) {
                    input.text?.clear()
                    dialog.dismiss()
                    onSubmit(pin)
                } else {
                    input.error = "Enter a 6-digit PIN"
                }
            }
        }
        actions.addView(cancel)
        actions.addView(submit)
        content.addView(title)
        content.addView(subtitle)
        content.addView(input)
        content.addView(actions)

        dialog.setContentView(content)
        dialog.setOnCancelListener { onCancel() }
        dialog.window?.setBackgroundDrawableResource(android.R.color.transparent)
        dialog.show()
        dialog.window?.setLayout(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
        )
        dialog.window?.setGravity(Gravity.BOTTOM)
        dialog.window?.attributes = dialog.window?.attributes?.apply {
            dimAmount = 0.45f
        }
        input.requestFocus()
    }

    private fun dp(activity: FragmentActivity, value: Int): Int =
        (value * activity.resources.displayMetrics.density).toInt()
}
