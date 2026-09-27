const assert = require("assert");
const { compute } = require("./calc.js");

function c(partial) {
  return compute(Object.assign({
    txn: "subsale",
    buyer: "citizen",
    sst: false,
    firstHome: false,
    subsidiary: false,
  }, partial));
}

function near(actual, expected, msg) {
  assert.ok(Math.abs(actual - expected) < 0.011, (msg || "") + " expected " + expected + " got " + actual);
}

// Published worked examples (Table A, citizen, 2026 stamp duty)
let r = c({ purchase: 300000, marginPct: 90 });
near(r.spaFee, 3750, "spa 300k");
near(r.spaStamp, 5000, "mot 300k");
near(r.loanAmount, 270000, "loan 90% of 300k");
near(r.loanFee, 3375, "loan fee 270k");
near(r.loanStamp, 1350, "loan duty 270k");

r = c({ purchase: 500000, marginPct: 90 });
near(r.spaFee, 6250, "spa 500k");
near(r.spaStamp, 9000, "mot 500k");
near(r.loanFee, 5625, "loan fee 450k");
near(r.loanStamp, 2250, "loan duty 450k");

r = c({ purchase: 1000000, marginPct: 70, buyer: "foreign-res" });
near(r.spaFee, 11250, "spa 1m");
near(r.spaStamp, 80000, "foreign residential 8%");
near(r.loanFee, 8250, "loan fee 700k");
near(r.loanStamp, 3500, "loan duty 700k");

r = c({ purchase: 1500000 });
near(r.spaFee, 16250, "spa 1.5m");
near(r.spaStamp, 44000, "mot 1.5m");

r = c({ purchase: 7500000 });
near(r.spaFee, 76250, "spa 7.5m");
r = c({ purchase: 8000000 });
near(r.spaFee, 81250, "spa 8m at 1% cap");
assert.strictEqual(r.negotiableSpa, true);

r = c({ purchase: 10000 });
near(r.spaFee, 500, "minimum fee");

r = c({ purchase: 500000, spaDiscountPct: 25 });
near(r.spaFee, 4687.5, "25% discount");
near(r.spaDiscountAmt, 1562.5, "discount amount");

r = c({ purchase: 50000, spaDiscountPct: 25 });
near(r.spaScale, 625, "scale 50k");
near(r.spaFee, 500, "discount held at minimum");
assert.strictEqual(r.spaMinHeld, true);

r = c({ purchase: 500000, spaDiscountPct: 40 });
near(r.spaFee, 3750, "40% discount");

r = c({ purchase: 338000 });
near(r.spaFee, 4225, "spa 338k");
near(r.spaStamp, 5760, "mot 338k");

r = c({ purchase: 338000, spaDiscountPct: 80 });
near(r.spaFee, 845, "80% discount");

r = c({ purchase: 10000, spaDiscountPct: 80 });
near(r.spaFee, 500, "80% held at minimum");

// Developer / HDA — First Schedule Table B 60% above RM1m; Third Schedule 50%
r = c({ purchase: 50000, txn: "hda" });
near(r.spaFee, 500, "hda flat");
r = c({ purchase: 250000, txn: "hda" });
near(r.spaFee, 2343.75, "hda 75%");
r = c({ purchase: 500000, txn: "hda" });
near(r.spaFee, 4375, "hda 70%");
r = c({ purchase: 1000000, txn: "hda" });
near(r.spaFee, 7312.5, "hda 65%");
r = c({ purchase: 1500000, txn: "hda", marginPct: 100 });
near(r.spaFee, 9750, "hda spa 60%");
near(r.loanFee, 8125, "hda loan 50%");
r = c({ purchase: 1500000, txn: "hda", spaDiscountPct: 25, marginPct: 100, loanDiscountPct: 25 });
near(r.spaFee, 9750, "hda ignores discount");
near(r.loanFee, 8125, "hda loan ignores discount");
assert.strictEqual(r.discountAllowed, false);

// Higher of price and market value for fees and MOT; lower for the loan base
r = c({ purchase: 400000, market: 450000, marginPct: 90 });
near(r.assessed, 450000, "assessed higher");
near(r.loanBase, 400000, "loan base lower");
near(r.spaStamp, 8000, "mot on 450k");
near(r.spaFee, 5625, "fee on 450k");
near(r.loanAmount, 360000, "90% of lower");
near(r.loanFee, 4500, "loan fee 360k");
near(r.loanStamp, 1800, "loan duty 360k");

// Only market value
r = c({ market: 300000 });
near(r.spaFee, 3750, "market only");
near(r.spaStamp, 5000, "market only duty");

// Foreign non-residential flat 4%
r = c({ purchase: 1000000, buyer: "foreign-nonres" });
near(r.spaStamp, 40000, "foreign non-res 4%");

// First-home exemption, citizen, assessed at or below RM500,000
r = c({ purchase: 500000, marginPct: 90, firstHome: true });
near(r.spaStamp, 0, "first home mot");
near(r.loanStamp, 0, "first home loan duty");
near(r.spaFee, 6250, "first home fee still payable");
assert.strictEqual(r.firstHomeApplied, true);

r = c({ purchase: 500001, marginPct: 90, firstHome: true });
assert.strictEqual(r.firstHomeApplied, false);
assert.strictEqual(r.firstHomeBlocked, true);
assert.ok(r.spaStamp > 0);

r = c({ purchase: 400000, buyer: "pr", firstHome: true, marginPct: 90 });
assert.strictEqual(r.firstHomeApplied, false);
assert.ok(r.spaStamp > 0);

// SST is 8% of professional fees only
r = c({ purchase: 500000, marginPct: 90, sst: true, spaDisbursement: 400, loanDisbursement: 150, spaDiscountPct: 0 });
near(r.spaSst, 500, "sst on 6250");
near(r.loanSst, 450, "sst on 5625");
near(r.solicitorTotal, 6250 + 500 + 400 + 5625 + 450 + 150, "solicitor stack");
near(r.dutyTotal, 9000 + 2250, "duty excluded from sst");

// Overrides replace the scale figure
r = c({ purchase: 500000, spaFeeOverride: 4000, spaStampOverride: 10, marginPct: 90, loanFeeOverride: 3000 });
near(r.spaFee, 4000, "custom spa fee");
near(r.spaStamp, 10, "custom stamp");
near(r.loanFee, 3000, "custom loan fee");
assert.strictEqual(r.spaFeeIsCustom, true);

// Subsidiary instrument: 10% of scale, RM500 to RM2,000, no discount on that slice
r = c({ purchase: 500000, marginPct: 100, subsidiary: true });
near(r.loanSubsidiary, 625, "subsidiary 10% of 6250");
near(r.loanFee, 6875, "principal plus subsidiary");
r = c({ purchase: 7500000, marginPct: 100, subsidiary: true });
near(r.loanSubsidiary, 2000, "subsidiary cap");
r = c({ purchase: 10000, marginPct: 100, subsidiary: true });
near(r.loanScale, 500, "min scale");
near(r.loanSubsidiary, 500, "subsidiary floor");

// Loan stamp rounds up to the next ringgit
r = c({ purchase: 270001, marginPct: 100 });
near(r.loanStamp, 1351, "loan duty rounds up");

// Awkward sen
r = c({ purchase: 333333.33 });
near(r.spaFee, 4166.67, "1.25% nearest sen");

// Empty
r = c({});
assert.strictEqual(r.present, false);
near(r.grandTotal, 0, "empty total");
assert.strictEqual(r.installment, null);

// Reducing-balance instalment: RM100,000, 6% p.a., 10 years ≈ RM1,110.21
r = c({ purchase: 100000, marginPct: 100, interestPct: 6, tenureYears: 10 });
near(r.installment, 1110.21, "instalment");

// Direct loan amount bypasses margin
r = c({ purchase: 500000, loanAmount: 200000 });
near(r.loanAmount, 200000, "typed loan");
near(r.loanFee, 2500, "fee on typed loan");

const { quote } = require("./calc.js");
const { buildQuotePdf } = require("./pdfquote.js");

function q(partial) {
  return quote(Object.assign({ persons: 1, discountPct: 0, sst: false, party: "vendor" }, partial));
}

let v = q({ price: 338000 });
near(v.fees[0].excl, 4225, "vendor spa");
near(v.feeInc, 5475, "vendor fees");
near(v.disbInc, 1040, "vendor disb");
near(v.grandInc, 6515, "vendor grand");
assert.strictEqual(v.fees.map((row) => row.label).indexOf("Discharge of Charge") >= 0, true);
assert.strictEqual(v.disb.some((row) => row.label.indexOf("Stamp Duty") === 0), false);
assert.strictEqual(v.disb[3].excl, null, "ctc dash");
assert.strictEqual(v.disb[3].label, "Certified True Copy of Title / Carian Rasmi", "ctc label");
assert.strictEqual(v.feeSst, null, "sst off");

v = q({ price: 338000, sst: true });
near(v.feeSst, 438, "sst on fees");
near(v.feeInc, 5913, "fees inc sst");
near(v.disbInc, 1040, "disb ignores sst");
near(v.grandInc, 6953, "grand with sst");
assert.strictEqual(v.disb.every((row) => row.sst == null), true);

v = q({ price: 338000, discountPct: 10 });
near(v.fees[0].excl, 3802.5, "10% spa");
near(v.feeInc, 5052.5, "fees after 10%");

v = q({ price: 338000, overrides: { spa: 1000 } });
near(v.fees[0].excl, 1000, "spa override");
near(v.feeInc, 2250, "fees with override");

v = q({ price: 338000, overrides: { land: null, ctc: 0 } });
assert.strictEqual(v.disb.find((row) => row.id === "land").excl, null, "blank land");
assert.strictEqual(v.disb.find((row) => row.id === "ctc").excl, 0, "zero ctc");
near(v.disbInc, 940, "disb without land");

v = q({ price: 338000, persons: 2 });
near(v.fees[1].excl, 1000, "ckht 1a two persons");
near(v.fees[2].excl, 400, "ckht 3 two persons");

v = q({ price: 10000, discountPct: 80 });
near(v.fees[0].excl, 500, "80% held at minimum");
assert.strictEqual(v.spaMinHeld, true);

let p = q({ party: "purchaser", price: 338000 });
near(p.fees[0].excl, 4225, "purchaser spa");
near(p.fees[1].excl, 200, "ckht 2a");
assert.strictEqual(p.fees.some((row) => row.id === "loanFee"), false);
assert.strictEqual(p.disb.some((row) => row.id === "mot"), true);
assert.strictEqual(p.disb.some((row) => row.id === "loanDuty"), false);
near(p.disb.find((row) => row.id === "mot").excl, 5760, "purchaser duty");
near(p.feeInc, 4575, "purchaser fees");
near(p.disbInc, 6760, "purchaser disb");
near(p.grandInc, 11335, "purchaser grand");

p = q({ party: "purchaser", price: 338000, loanOn: true });
near(p.loanAmount, 304200, "loan 90%");
near(p.fees.find((row) => row.id === "loanFee").excl, 3802.5, "loan fee");
near(p.disb.find((row) => row.id === "loanDuty").excl, 1521, "loan duty");
assert.strictEqual(p.disb.some((row) => row.id === "regCharge"), true);

p = q({ party: "purchaser", price: 338000, loanOn: true, loanAmount: 200000, firstHome: true });
near(p.disb.find((row) => row.id === "mot").excl, 0, "first home transfer");
near(p.disb.find((row) => row.id === "loanDuty").excl, 0, "first home loan duty");
near(p.fees[0].excl, 4225, "first home fee remains");

p = q({ party: "purchaser", price: 338000, buyer: "foreign-res" });
near(p.disb.find((row) => row.id === "mot").excl, 27040, "foreign residential");

p = q({ party: "vendor", price: 338000, loanOn: true });
assert.strictEqual(p.loanOn, false, "vendor has no loan");
assert.strictEqual(p.disb.some((row) => row.id === "mot"), false);

const bytes = buildQuotePdf(q({ price: 338000 }), {});
const raw = Buffer.from(bytes).toString("latin1");
assert.ok(raw.indexOf("%PDF-1.4") === 0, "pdf header");
assert.ok(raw.indexOf("Sale and Purchase Agreement") > 0, "pdf spa line");
assert.ok(raw.indexOf("6,515.00") > 0, "pdf grand");
assert.ok(raw.indexOf("Vendor") > 0, "pdf party");
assert.ok(raw.indexOf("Discharge of Charge") > 0, "pdf discharge");
assert.strictEqual(raw.indexOf("Purchaser"), -1, "vendor pdf has no purchaser");
assert.ok(raw.indexOf("might varies") > 0, "pdf note wording");
assert.ok(raw.indexOf("Certified True Copy of Title / Carian Rasmi") > 0, "pdf ctc label");

const buyerPdf = Buffer.from(buildQuotePdf(q({ party: "purchaser", price: 338000, loanOn: true }))).toString("latin1");
assert.ok(buyerPdf.indexOf("Purchaser") > 0, "purchaser label");
assert.ok(buyerPdf.indexOf("Stamp Duty on Transfer") > 0, "duty line");
assert.ok(buyerPdf.indexOf("Loan Agreement and Charge") > 0, "loan line");
assert.strictEqual(buyerPdf.indexOf("Discharge of Charge"), -1, "no vendor discharge");

console.log("All calculator checks passed.");
