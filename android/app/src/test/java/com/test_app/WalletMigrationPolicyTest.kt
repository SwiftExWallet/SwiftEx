package org.app.swiftEx.wallet

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WalletMigrationPolicyTest {
    private val wallets = """[{"walletId":"1001","name":"Main","address":"0xabc"}]"""
    private val active = """{"walletId":"1001","name":"Main","address":"0xabc"}"""

    @Test
    fun `readable valid wallet data selects migration`() {
        val decision = WalletMigrationPolicy.decide(
            listOf(LegacyWalletSourceResult.Readable("v2", wallets, active)),
        )

        assertEquals(WalletMigrationDecision.Migrate(wallets, active), decision)
    }

    @Test
    fun `only confirmed absent sources select fresh install`() {
        val decision = WalletMigrationPolicy.decide(
            listOf(
                LegacyWalletSourceResult.Absent("v2"),
                LegacyWalletSourceResult.Absent("legacy"),
                LegacyWalletSourceResult.Absent("v3"),
            ),
        )

        assertEquals(WalletMigrationDecision.FreshInstall, decision)
    }

    @Test
    fun `any unreadable source blocks migration without treating it as absent`() {
        val decision = WalletMigrationPolicy.decide(
            listOf(
                LegacyWalletSourceResult.Unreadable("v2", "key invalidated"),
                LegacyWalletSourceResult.Absent("legacy"),
            ),
        )

        assertTrue(decision is WalletMigrationDecision.Blocked)
        assertEquals("v2", (decision as WalletMigrationDecision.Blocked).source)
    }

    @Test
    fun `malformed wallet JSON blocks migration`() {
        val decision = WalletMigrationPolicy.decide(
            listOf(LegacyWalletSourceResult.Readable("legacy", "not-json", active)),
        )

        assertTrue(decision is WalletMigrationDecision.Blocked)
    }

    @Test
    fun `empty wallet array blocks migration`() {
        val decision = WalletMigrationPolicy.decide(
            listOf(LegacyWalletSourceResult.Readable("legacy", "[]", active)),
        )

        assertTrue(decision is WalletMigrationDecision.Blocked)
    }

    @Test
    fun `missing active wallet blocks migration`() {
        val decision = WalletMigrationPolicy.decide(
            listOf(LegacyWalletSourceResult.Readable("legacy", wallets, null)),
        )

        assertTrue(decision is WalletMigrationDecision.Blocked)
    }

    @Test
    fun `active wallet not present in wallet array blocks migration`() {
        val otherActive = """{"walletId":"9999","name":"Other","address":"0xdef"}"""

        val decision = WalletMigrationPolicy.decide(
            listOf(LegacyWalletSourceResult.Readable("legacy", wallets, otherActive)),
        )

        assertTrue(decision is WalletMigrationDecision.Blocked)
    }

    @Test
    fun `conflicting destination and legacy sources block instead of overwriting`() {
        val newerWallets = """[{"walletId":"2002","name":"New","address":"0xdef"}]"""
        val newerActive = """{"walletId":"2002","name":"New","address":"0xdef"}"""
        val decision = WalletMigrationPolicy.decide(
            listOf(
                LegacyWalletSourceResult.Readable("v4_destination", newerWallets, newerActive),
                LegacyWalletSourceResult.Readable("legacy", wallets, active),
            ),
        )

        assertTrue(decision is WalletMigrationDecision.Blocked)
    }

    @Test
    fun `stale completion marker cannot bypass a present legacy candidate`() {
        val state = WalletMigrationPolicy.currentState(
            markerSet = true,
            destinationWallets = null,
            destinationActiveWallet = null,
            legacyCandidatePresent = true,
        )

        assertEquals(WalletMigrationCurrentState.NeedsMigration, state)
    }

    @Test
    fun `valid marked destination is already migrated`() {
        val state = WalletMigrationPolicy.currentState(
            markerSet = true,
            destinationWallets = wallets,
            destinationActiveWallet = active,
            legacyCandidatePresent = true,
        )

        assertEquals(WalletMigrationCurrentState.AlreadyMigrated, state)
    }

    @Test
    fun `destination verification failure prevents legacy cleanup`() {
        assertFalse(
            WalletMigrationPolicy.canCleanup(
                destinationVerified = false,
                markerCommitted = true,
            ),
        )
    }

    @Test
    fun `legacy cleanup requires both destination verification and marker commit`() {
        assertFalse(WalletMigrationPolicy.canCleanup(destinationVerified = true, markerCommitted = false))
        assertTrue(WalletMigrationPolicy.canCleanup(destinationVerified = true, markerCommitted = true))
    }
}
