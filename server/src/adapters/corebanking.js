// Core-banking payload mappers → EdgeVerify canonical transaction.
// Register the bank's system in tenant.settings.core_banking and POST raw payloads to /v1/transactions/ingest/:system.
// Canonical: { external_ref, customer_ref, account_id, direction, tx_type, amount, currency, counterparty_*, origin_country, destination_country, channel, device_id, ip_address, narrative, occurred_at }

const first = (...v) => v.find(x => x !== undefined && x !== null && x !== '');
const dir = (v) => /^(C|CR|CREDIT|IN|INWARD|RECEIVE)$/i.test(String(v)) ? 'credit' : 'debit';

export const MAPPERS = {
  // ISO 20022 pacs.008 / camt.053 (JSON-ised). Works for SWIFT gpi, SEPA, NIP/NIBSS ISO rails.
  iso20022: (p) => { const t = p.CdtTrfTxInf || p.Ntry || p; return {
    external_ref: first(t.PmtId?.EndToEndId, t.PmtId?.TxId, t.AcctSvcrRef), customer_ref: first(t.Dbtr?.Id?.PrvtId?.Othr?.Id, t.Dbtr?.Nm),
    account_id: first(t.DbtrAcct?.Id?.IBAN, t.DbtrAcct?.Id?.Othr?.Id), direction: t.CdtDbtInd ? dir(t.CdtDbtInd) : 'debit', tx_type: 'wire',
    amount: Number(first(t.IntrBkSttlmAmt?.['#text'], t.IntrBkSttlmAmt?.Amt, t.Amt?.['#text'], t.Amt)), currency: first(t.IntrBkSttlmAmt?.Ccy, t.Amt?.Ccy, 'USD'),
    counterparty_name: t.Cdtr?.Nm, counterparty_account: first(t.CdtrAcct?.Id?.IBAN, t.CdtrAcct?.Id?.Othr?.Id), counterparty_bank: t.CdtrAgt?.FinInstnId?.BICFI,
    counterparty_country: first(t.Cdtr?.PstlAdr?.Ctry, t.CdtrAgt?.FinInstnId?.PstlAdr?.Ctry), origin_country: t.Dbtr?.PstlAdr?.Ctry, destination_country: t.Cdtr?.PstlAdr?.Ctry,
    channel: 'swift', narrative: t.RmtInf?.Ustrd, occurred_at: first(t.IntrBkSttlmDt, t.BookgDt?.Dt, new Date().toISOString()) }; },
  // Infosys Finacle (FI_ / EB APIs)
  finacle: (p) => ({ external_ref: first(p.TranId, p.tranId, p.RefNum), customer_ref: first(p.CustId, p.custId), account_id: first(p.AcctId, p.ForacId, p.acctId),
    direction: dir(first(p.PartTranType, p.TranType)), tx_type: mapFinacleType(p.TranSubType || p.TranParticulars), amount: Number(first(p.TranAmt, p.Amt)), currency: first(p.TranCrncyCode, p.Crncy, 'NGN'),
    counterparty_name: first(p.BenName, p.RemitterName), counterparty_account: first(p.BenAcctNo, p.RemitterAcct), counterparty_bank: p.BenBankCode, counterparty_country: p.BenCountry,
    origin_country: p.OrigCountry, destination_country: p.BenCountry, channel: first(p.Channel, p.TranSrc), device_id: p.DeviceId, ip_address: p.ClientIp, narrative: p.TranParticulars, occurred_at: first(p.TranDate, p.ValueDate) }),
  // Temenos T24 / Transact (FUNDS.TRANSFER / STMT.ENTRY)
  t24: (p) => ({ external_ref: first(p['@ID'], p.TRANSACTION_ID, p.FT_ID), customer_ref: first(p.CUSTOMER_ID, p.DEBIT_CUSTOMER), account_id: first(p.DEBIT_ACCT_NO, p.ACCOUNT_NUMBER),
    direction: p.DEBIT_ACCT_NO ? 'debit' : 'credit', tx_type: mapT24Type(p.TRANSACTION_TYPE), amount: Number(first(p.DEBIT_AMOUNT, p.CREDIT_AMOUNT, p.AMOUNT_LCY)), currency: first(p.DEBIT_CURRENCY, p.CREDIT_CURRENCY, 'USD'),
    counterparty_name: p.BENEFICIARY_NAME || p.ORDERING_CUST, counterparty_account: p.CREDIT_ACCT_NO || p.BEN_ACCT_NO, counterparty_bank: p.ACCT_WITH_BANK, counterparty_country: p.BEN_COUNTRY,
    origin_country: p.ORDERING_COUNTRY, destination_country: p.BEN_COUNTRY, channel: p.INPUTTER_CHANNEL, narrative: p.PAYMENT_DETAILS, occurred_at: first(p.DEBIT_VALUE_DATE, p.BOOKING_DATE) }),
  // Oracle FLEXCUBE (FCUBS)
  flexcube: (p) => ({ external_ref: first(p.TRN_REF_NO, p.XREF), customer_ref: p.CUST_NO, account_id: p.AC_NO, direction: dir(p.DRCR_IND), tx_type: mapFlexType(p.TRN_CODE, p.PRODUCT),
    amount: Number(first(p.LCY_AMOUNT, p.FCY_AMOUNT, p.AMOUNT)), currency: first(p.AC_CCY, 'USD'), counterparty_name: p.BENEFICIARY, counterparty_account: p.BEN_AC_NO, counterparty_bank: p.BEN_BANK,
    counterparty_country: p.BEN_COUNTRY, destination_country: p.BEN_COUNTRY, channel: p.SOURCE_CODE, narrative: p.TRN_DESC, occurred_at: first(p.TRN_DT, p.VALUE_DT) }),
  // Mambu (REST API transactions webhook)
  mambu: (p) => ({ external_ref: first(p.encodedKey, p.id), customer_ref: p.clientKey || p.accountHolderKey, account_id: p.parentAccountKey || p.accountId, direction: /DEPOSIT|TRANSFER_IN|CREDIT/i.test(p.type) ? 'credit' : 'debit',
    tx_type: /CASH/i.test(p.paymentDetails?.paymentMethod || p.channelId || '') ? 'cash' : 'transfer', amount: Math.abs(Number(p.amount)), currency: first(p.currencyCode, 'USD'),
    counterparty_name: p.transferDetails?.linkedAccountKey ? undefined : p.paymentDetails?.creditor?.name, counterparty_account: p.transferDetails?.linkedAccountKey || p.paymentDetails?.creditorAccount?.identification?.iban,
    counterparty_country: p.paymentDetails?.creditor?.postalAddress?.country, channel: p.channelId || p.transactionChannelId, device_id: p.userKey, narrative: p.notes, occurred_at: first(p.creationDate, p.valueDate) }),
  // Finastra Fusion Essence / Equation
  finastra: (p) => ({ external_ref: p.transactionReference, customer_ref: p.customerId, account_id: p.accountNumber, direction: dir(p.debitCreditIndicator), tx_type: p.transactionType?.toLowerCase() || 'transfer',
    amount: Number(p.amount), currency: p.currency, counterparty_name: p.counterparty?.name, counterparty_account: p.counterparty?.accountNumber, counterparty_bank: p.counterparty?.bic, counterparty_country: p.counterparty?.country,
    destination_country: p.counterparty?.country, channel: p.channel, narrative: p.description, occurred_at: p.transactionDate }),
  // BankOne (Nigerian MFB core) & NIBSS NIP-style payloads
  bankone: (p) => ({ external_ref: first(p.UniqueIdentifier, p.ReferenceID), customer_ref: p.CustomerID, account_id: p.AccountNumber, direction: /^C/i.test(p.RecordType) ? 'credit' : 'debit',
    tx_type: /CASH|TELLER/i.test(p.TransactionType || '') ? 'cash' : 'transfer', amount: Number(p.Amount), currency: first(p.Currency, 'NGN'), counterparty_name: p.BeneficiaryName || p.PayerName,
    counterparty_account: p.BeneficiaryAccountNumber, counterparty_bank: p.BeneficiaryBankCode, counterparty_country: 'NG', destination_country: 'NG', channel: p.Channel, narrative: p.Narration, occurred_at: p.TransactionDate }),
  nip: (p) => ({ external_ref: first(p.sessionId, p.transactionId), customer_ref: p.originatorKycLevel ? p.originatorAccountNumber : p.debitAccountNumber, account_id: first(p.originatorAccountNumber, p.debitAccountNumber),
    direction: 'debit', tx_type: 'transfer', amount: Number(p.amount), currency: 'NGN', counterparty_name: p.beneficiaryAccountName, counterparty_account: p.beneficiaryAccountNumber, counterparty_bank: p.destinationInstitutionCode,
    counterparty_country: 'NG', destination_country: 'NG', channel: p.channelCode, narrative: p.narration, occurred_at: p.transactionTime || new Date().toISOString() }),
  // Already-canonical payload
  canonical: (p) => p,
};

const mapFinacleType = (s = '') => /CASH|CSH/i.test(s) ? 'cash' : /RTGS|SWIFT|TT|WIRE/i.test(s) ? 'wire' : /POS|CARD|ATM/i.test(s) ? 'card' : 'transfer';
const mapT24Type = (s = '') => /AC|ACPO|ACRT/i.test(s) ? 'transfer' : /OT|OTPI|OTRT/i.test(s) ? 'wire' : /CASH|CW|CD/i.test(s) ? 'cash' : 'transfer';
const mapFlexType = (code = '', product = '') => /CASH|CSH|TEL/i.test(code + product) ? 'cash' : /OUT|INW|SWIFT|RTGS/i.test(code + product) ? 'wire' : 'transfer';

export function toCanonical(system, payload) {
  const m = MAPPERS[String(system || 'canonical').toLowerCase()];
  if (!m) throw new Error(`Unknown core banking system "${system}". Supported: ${Object.keys(MAPPERS).join(', ')}`);
  return m(payload);
}
