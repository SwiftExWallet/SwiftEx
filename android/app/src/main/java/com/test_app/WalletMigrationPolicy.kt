package org.app.swiftEx.wallet

import org.json.JSONArray
import org.json.JSONObject

sealed class LegacyWalletSourceResult {
    abstract val source: String

    data class Absent(override val source: String) : LegacyWalletSourceResult()

    data class Readable(
        override val source: String,
        val wallets: String?,
        val activeWallet: String?,
    ) : LegacyWalletSourceResult()

    data class Unreadable(
        override val source: String,
        val reason: String,
    ) : LegacyWalletSourceResult()
}

sealed class WalletMigrationDecision {
    data object FreshInstall : WalletMigrationDecision()

    data class Migrate(
        val wallets: String,
        val activeWallet: String,
    ) : WalletMigrationDecision()

    data class Blocked(
        val source: String,
        val reason: String,
    ) : WalletMigrationDecision()
}

enum class WalletMigrationCurrentState {
    AlreadyMigrated,
    FreshInstallComplete,
    NeedsMigration,
}

object WalletMigrationPolicy {
    fun currentState(
        markerSet: Boolean,
        destinationWallets: String?,
        destinationActiveWallet: String?,
        legacyCandidatePresent: Boolean,
    ): WalletMigrationCurrentState {
        if (markerSet &&
            destinationWallets != null &&
            destinationActiveWallet != null &&
            validate(destinationWallets, destinationActiveWallet)
        ) {
            return WalletMigrationCurrentState.AlreadyMigrated
        }
        if (markerSet &&
            destinationWallets == null &&
            destinationActiveWallet == null &&
            !legacyCandidatePresent
        ) {
            return WalletMigrationCurrentState.FreshInstallComplete
        }
        return WalletMigrationCurrentState.NeedsMigration
    }

    fun canCleanup(destinationVerified: Boolean, markerCommitted: Boolean): Boolean =
        destinationVerified && markerCommitted

    fun decide(results: List<LegacyWalletSourceResult>): WalletMigrationDecision {
        if (results.isEmpty()) {
            return WalletMigrationDecision.Blocked("migration", "No legacy sources were inspected")
        }

        results.filterIsInstance<LegacyWalletSourceResult.Unreadable>().firstOrNull()?.let {
            return WalletMigrationDecision.Blocked(it.source, it.reason)
        }

        val readable = results.filterIsInstance<LegacyWalletSourceResult.Readable>()
        if (readable.isEmpty()) return WalletMigrationDecision.FreshInstall

        val first = readable.first()
        val wallets = first.wallets
            ?: return WalletMigrationDecision.Blocked(first.source, "Wallet collection is missing")
        val active = first.activeWallet
            ?: return WalletMigrationDecision.Blocked(first.source, "Active wallet is missing")

        if (!validate(wallets, active)) {
            return WalletMigrationDecision.Blocked(first.source, "Wallet data is invalid or inconsistent")
        }

        if (readable.drop(1).any { it.wallets != wallets || it.activeWallet != active }) {
            return WalletMigrationDecision.Blocked("migration", "Legacy wallet sources disagree")
        }

        return WalletMigrationDecision.Migrate(wallets, active)
    }

    fun validate(wallets: String, activeWallet: String): Boolean {
        return try {
            val walletArray = JSONArray(wallets)
            if (walletArray.length() == 0) return false

            val active = JSONObject(activeWallet)
            val activeId = active.optString("walletId").takeIf { it.isNotBlank() }
            val activeAddress = active.optString("address").takeIf { it.isNotBlank() }
            if (activeId == null && activeAddress == null) return false

            (0 until walletArray.length()).any { index ->
                val wallet = walletArray.optJSONObject(index) ?: return@any false
                if (activeId != null) wallet.optString("walletId") == activeId
                else wallet.optString("address") == activeAddress
            }
        } catch (_: Exception) {
            false
        }
    }
}
