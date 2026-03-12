// ONYX v7 Payment Module — Stablecoin Transactions
// Modular companion to onyxpriv_v7.aleo
//
// This program handles all stablecoin-based payment flows:
//   - pay_verification_usdcx / pay_verification_usad
//   - buy_sale_usdcx / buy_sale_usad
//
// Each transition:
//   1. Transfers stablecoin tokens via transfer_private
//   2. Calls back to onyxpriv_v7.aleo helper to create receipts & update state

import test_usdcx_stablecoin.aleo;
import test_usad_stablecoin.aleo;
import onyxpriv_v7.aleo;

program onyxpriv_v7_pay.aleo {

    // Constructor required for deployment
    @noupgrade
    async constructor() {}

    // ================================================================
    //              STABLECOIN VERIFICATION PAYMENTS
    // ================================================================

    // ─── Pay verification fee in USDCx ──────────────────────────────
    async transition pay_verification_usdcx(
        public seller: address,
        public amount: u128,
        input_record: test_usdcx_stablecoin.aleo/Token,
        proofs: [MerkleProof; 2],
        tag_hash: field,
        payment_secret: field,
        salt: field
    ) -> (
        test_usdcx_stablecoin.aleo/ComplianceRecord,
        test_usdcx_stablecoin.aleo/Token,
        test_usdcx_stablecoin.aleo/Token,
        onyxpriv_v7.aleo/BuyerReceipt,
        onyxpriv_v7.aleo/SellerReceipt,
        Future
    ) {
        let (compliance, seller_token, change, transfer_f): (
            test_usdcx_stablecoin.aleo/ComplianceRecord,
            test_usdcx_stablecoin.aleo/Token,
            test_usdcx_stablecoin.aleo/Token,
            Future
        ) = test_usdcx_stablecoin.aleo/transfer_private(seller, amount, input_record, proofs);

        let amount_u64: u64 = amount as u64;

        let (buyer_receipt, seller_receipt, reg_f): (
            onyxpriv_v7.aleo/BuyerReceipt,
            onyxpriv_v7.aleo/SellerReceipt,
            Future
        ) = onyxpriv_v7.aleo/reg_stablecoin_verify(
            seller, tag_hash, payment_secret, salt, amount_u64, 1u8
        );

        let f: Future = finalize_pay_verification_usdcx(transfer_f, reg_f);
        return (compliance, seller_token, change, buyer_receipt, seller_receipt, f);
    }

    async function finalize_pay_verification_usdcx(transfer_f: Future, reg_f: Future) {
        transfer_f.await();
        reg_f.await();
    }

    // ─── Pay verification fee in USAD ───────────────────────────────
    async transition pay_verification_usad(
        public seller: address,
        public amount: u128,
        input_record: test_usad_stablecoin.aleo/Token,
        proofs: [MerkleProof; 2],
        tag_hash: field,
        payment_secret: field,
        salt: field
    ) -> (
        test_usad_stablecoin.aleo/ComplianceRecord,
        test_usad_stablecoin.aleo/Token,
        test_usad_stablecoin.aleo/Token,
        onyxpriv_v7.aleo/BuyerReceipt,
        onyxpriv_v7.aleo/SellerReceipt,
        Future
    ) {
        let (compliance, seller_token, change, transfer_f): (
            test_usad_stablecoin.aleo/ComplianceRecord,
            test_usad_stablecoin.aleo/Token,
            test_usad_stablecoin.aleo/Token,
            Future
        ) = test_usad_stablecoin.aleo/transfer_private(seller, amount, input_record, proofs);

        let amount_u64: u64 = amount as u64;

        let (buyer_receipt, seller_receipt, reg_f): (
            onyxpriv_v7.aleo/BuyerReceipt,
            onyxpriv_v7.aleo/SellerReceipt,
            Future
        ) = onyxpriv_v7.aleo/reg_stablecoin_verify(
            seller, tag_hash, payment_secret, salt, amount_u64, 2u8
        );

        let f: Future = finalize_pay_verification_usad(transfer_f, reg_f);
        return (compliance, seller_token, change, buyer_receipt, seller_receipt, f);
    }

    async function finalize_pay_verification_usad(transfer_f: Future, reg_f: Future) {
        transfer_f.await();
        reg_f.await();
    }

    // ================================================================
    //              STABLECOIN SALE PAYMENTS
    // ================================================================

    // ─── Buy sale with USDCx ────────────────────────────────────────
    async transition buy_sale_usdcx(
        public seller: address,
        public amount: u128,
        input_record: test_usdcx_stablecoin.aleo/Token,
        proofs: [MerkleProof; 2],
        tag_hash: field
    ) -> (
        test_usdcx_stablecoin.aleo/ComplianceRecord,
        test_usdcx_stablecoin.aleo/Token,
        test_usdcx_stablecoin.aleo/Token,
        onyxpriv_v7.aleo/PurchaseReceipt,
        Future
    ) {
        let (compliance, seller_token, change, transfer_f): (
            test_usdcx_stablecoin.aleo/ComplianceRecord,
            test_usdcx_stablecoin.aleo/Token,
            test_usdcx_stablecoin.aleo/Token,
            Future
        ) = test_usdcx_stablecoin.aleo/transfer_private(seller, amount, input_record, proofs);

        let amount_u64: u64 = amount as u64;

        let (receipt, reg_f): (onyxpriv_v7.aleo/PurchaseReceipt, Future) =
            onyxpriv_v7.aleo/reg_stablecoin_buy(tag_hash, amount_u64, seller, 1u8);

        let f: Future = finalize_buy_sale_usdcx(transfer_f, reg_f);
        return (compliance, seller_token, change, receipt, f);
    }

    async function finalize_buy_sale_usdcx(transfer_f: Future, reg_f: Future) {
        transfer_f.await();
        reg_f.await();
    }

    // ─── Buy sale with USAD ─────────────────────────────────────────
    async transition buy_sale_usad(
        public seller: address,
        public amount: u128,
        input_record: test_usad_stablecoin.aleo/Token,
        proofs: [MerkleProof; 2],
        tag_hash: field
    ) -> (
        test_usad_stablecoin.aleo/ComplianceRecord,
        test_usad_stablecoin.aleo/Token,
        test_usad_stablecoin.aleo/Token,
        onyxpriv_v7.aleo/PurchaseReceipt,
        Future
    ) {
        let (compliance, seller_token, change, transfer_f): (
            test_usad_stablecoin.aleo/ComplianceRecord,
            test_usad_stablecoin.aleo/Token,
            test_usad_stablecoin.aleo/Token,
            Future
        ) = test_usad_stablecoin.aleo/transfer_private(seller, amount, input_record, proofs);

        let amount_u64: u64 = amount as u64;

        let (receipt, reg_f): (onyxpriv_v7.aleo/PurchaseReceipt, Future) =
            onyxpriv_v7.aleo/reg_stablecoin_buy(tag_hash, amount_u64, seller, 2u8);

        let f: Future = finalize_buy_sale_usad(transfer_f, reg_f);
        return (compliance, seller_token, change, receipt, f);
    }

    async function finalize_buy_sale_usad(transfer_f: Future, reg_f: Future) {
        transfer_f.await();
        reg_f.await();
    }
}
