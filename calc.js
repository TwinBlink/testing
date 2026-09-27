/* Malaysia SPA & loan fee engine.
   Solicitors' Remuneration Order 2023 (in force 15 July 2023; fee schedules
   unamended through 2026) and Stamp Act 1949 as applied in 2026.
   Amounts are integer sen. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.FeeCalc = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const SST_RATE = 0.08;
  const MIN_FEE = 50000;
  const SUB_MIN = 50000;
  const SUB_MAX = 200000;

  function sen(ringgit) {
    if (ringgit == null || !isFinite(ringgit) || ringgit <= 0) return 0;
    return Math.round(ringgit * 100);
  }

  function rm(cents) {
    return Math.round(cents) / 100;
  }

  function roundSen(x) {
    return Math.round(x);
  }

  function ceilRinggit(centsFloat) {
    if (!(centsFloat > 0)) return 0;
    return Math.ceil(centsFloat / 100 - 1e-8) * 100;
  }

  function sliceFee(amountSen, slices) {
    let remain = amountSen;
    let fee = 0;
    for (let i = 0; i < slices.length && remain > 0; i++) {
      const take = Math.min(remain, slices[i].width);
      fee += (take * slices[i].bps) / 10000;
      remain -= take;
    }
    return fee;
  }

  function tableA(amountSen) {
    if (amountSen <= 0) return 0;
    const raw = sliceFee(amountSen, [
      { width: 50000000, bps: 125 },
      { width: 700000000, bps: 100 },
      { width: Infinity, bps: 100 },
    ]);
    return Math.max(MIN_FEE, roundSen(raw));
  }

  function tableB(amountSen, kind) {
    if (amountSen <= 0) return 0;
    const ringgit = amountSen / 100;
    if (ringgit <= 50000) return MIN_FEE;
    const base = tableA(amountSen);
    let pct = 0.75;
    if (ringgit <= 250000) pct = 0.75;
    else if (ringgit <= 500000) pct = 0.7;
    else if (ringgit <= 1000000) pct = 0.65;
    else pct = kind === "loan" ? 0.5 : 0.6;
    return Math.max(MIN_FEE, roundSen(base * pct));
  }

  function scaleFee(amountSen, txn, kind) {
    if (txn === "hda") return tableB(amountSen, kind);
    return tableA(amountSen);
  }

  function applyDiscount(scale, pct, allowed) {
    if (!(scale > 0)) return { fee: 0, pct: 0, held: false, discount: 0 };
    let p = Number(pct);
    if (!isFinite(p) || p < 0) p = 0;
    if (!allowed) p = 0;
    if (p > 80) p = 80;
    const feeRaw = roundSen((scale * (100 - p)) / 100);
    const held = feeRaw < MIN_FEE;
    const fee = held ? MIN_FEE : feeRaw;
    return { fee: fee, pct: p, held: held, discount: scale - fee };
  }

  function subsidiary(scale) {
    if (!(scale > 0)) return 0;
    return Math.min(SUB_MAX, Math.max(SUB_MIN, roundSen(scale * 0.1)));
  }

  function motDuty(amountSen, buyer) {
    if (amountSen <= 0) return 0;
    if (buyer === "foreign-res") return ceilRinggit((amountSen * 800) / 10000);
    if (buyer === "foreign-nonres") return ceilRinggit((amountSen * 400) / 10000);
    const raw = sliceFee(amountSen, [
      { width: 10000000, bps: 100 },
      { width: 40000000, bps: 200 },
      { width: 50000000, bps: 300 },
      { width: Infinity, bps: 400 },
    ]);
    return ceilRinggit(raw);
  }

  function loanDuty(amountSen) {
    if (amountSen <= 0) return 0;
    return ceilRinggit((amountSen * 50) / 10000);
  }

  function installment(principalRm, annualPct, years) {
    if (!(principalRm > 0) || !(years > 0)) return null;
    const n = Math.round(years * 12);
    if (n <= 0) return null;
    if (!(annualPct > 0)) return principalRm / n;
    const r = annualPct / 100 / 12;
    const pow = Math.pow(1 + r, n);
    return (principalRm * r * pow) / (pow - 1);
  }

  function compute(input) {
    const txn = input.txn === "hda" ? "hda" : "subsale";
    const buyer = input.buyer || "citizen";
    const discountAllowed = txn === "subsale";
    const purchase = sen(input.purchase);
    const market = sen(input.market);
    const present = purchase > 0 || market > 0;
    const assessed = Math.max(purchase, market);
    const loanBase = purchase > 0 && market > 0 ? Math.min(purchase, market) : assessed;

    const spaScale = present ? scaleFee(assessed, txn, "spa") : 0;
    const spaDisc = applyDiscount(spaScale, input.spaDiscountPct, discountAllowed);
    const spaFee = input.spaFeeOverride != null && present ? sen(input.spaFeeOverride) : spaDisc.fee;
    const spaDisb = sen(input.spaDisbursement);
    const spaSst = input.sst && spaFee > 0 ? roundSen((spaFee * 8) / 100) : 0;

    const firstHomeEligible =
      !!input.firstHome && buyer === "citizen" && assessed > 0 && assessed <= 50000000;
    const firstHomeBlocked = !!input.firstHome && !firstHomeEligible && present;

    const spaStampScale = present ? motDuty(assessed, buyer) : 0;
    let spaStamp = firstHomeEligible ? 0 : spaStampScale;
    if (input.spaStampOverride != null && present) spaStamp = sen(input.spaStampOverride);

    let loanAmount = 0;
    let loanMargin = null;
    if (input.loanAmount != null && input.loanAmount !== "" && isFinite(Number(input.loanAmount))) {
      loanAmount = sen(Number(input.loanAmount));
      loanMargin = loanBase > 0 ? (loanAmount / loanBase) * 100 : null;
    } else if (input.marginPct != null && input.marginPct !== "" && loanBase > 0 && isFinite(Number(input.marginPct))) {
      loanMargin = Number(input.marginPct);
      loanAmount = roundSen((loanBase * loanMargin) / 100);
    }

    const hasLoan = loanAmount > 0;
    const loanScale = hasLoan ? scaleFee(loanAmount, txn, "loan") : 0;
    const loanDisc = applyDiscount(loanScale, input.loanDiscountPct, discountAllowed);
    const loanSubInst = input.subsidiary && hasLoan ? subsidiary(loanScale) : 0;
    const loanFeeAuto = loanDisc.fee + loanSubInst;
    const loanFee = input.loanFeeOverride != null && hasLoan ? sen(input.loanFeeOverride) : loanFeeAuto;
    const loanDisb = hasLoan ? sen(input.loanDisbursement) : 0;
    const loanSst = input.sst && loanFee > 0 ? roundSen((loanFee * 8) / 100) : 0;
    const loanStampScale = hasLoan ? loanDuty(loanAmount) : 0;
    let loanStamp = firstHomeEligible ? 0 : loanStampScale;
    if (input.loanStampOverride != null && hasLoan) loanStamp = sen(input.loanStampOverride);

    const solicitor = spaFee + spaSst + spaDisb + (hasLoan ? loanFee + loanSst + loanDisb : 0);
    const duty = spaStamp + (hasLoan ? loanStamp : 0);
    const inst = installment(
      loanAmount / 100,
      input.interestPct == null || input.interestPct === "" ? null : Number(input.interestPct),
      input.tenureYears == null || input.tenureYears === "" ? null : Number(input.tenureYears)
    );

    return {
      txn: txn,
      buyer: buyer,
      discountAllowed: discountAllowed,
      assessed: rm(assessed),
      loanBase: rm(loanBase),
      priceUsedHigher: purchase > 0 && market > 0 && purchase !== market,
      spaScale: rm(spaScale),
      spaDiscountPct: input.spaFeeOverride != null ? null : spaDisc.pct,
      spaDiscountAmt: input.spaFeeOverride != null ? 0 : rm(spaDisc.discount),
      spaMinHeld: input.spaFeeOverride != null ? false : spaDisc.held,
      spaFee: rm(spaFee),
      spaFeeIsCustom: input.spaFeeOverride != null && present,
      spaDisbursement: rm(spaDisb),
      spaSst: rm(spaSst),
      spaStampScale: rm(spaStampScale),
      spaStamp: rm(spaStamp),
      spaStampIsCustom: input.spaStampOverride != null && present,
      loanAmount: rm(loanAmount),
      loanMargin: loanMargin,
      hasLoan: hasLoan,
      loanScale: rm(loanScale),
      loanDiscountPct: input.loanFeeOverride != null ? null : loanDisc.pct,
      loanDiscountAmt: input.loanFeeOverride != null ? 0 : rm(loanDisc.discount),
      loanMinHeld: input.loanFeeOverride != null ? false : loanDisc.held && hasLoan,
      loanPrincipalFee: rm(loanDisc.fee),
      loanSubsidiary: rm(loanSubInst),
      loanFee: rm(loanFee),
      loanFeeIsCustom: input.loanFeeOverride != null && hasLoan,
      loanDisbursement: rm(loanDisb),
      loanSst: rm(loanSst),
      loanStampScale: rm(loanStampScale),
      loanStamp: rm(loanStamp),
      loanStampIsCustom: input.loanStampOverride != null && hasLoan,
      solicitorTotal: rm(solicitor),
      dutyTotal: rm(duty),
      grandTotal: rm(solicitor + duty),
      installment: inst == null ? null : Math.round(inst * 100) / 100,
      totalPayable: inst == null ? null : Math.round(inst * Math.round(Number(input.tenureYears) * 12) * 100) / 100,
      negotiableSpa: assessed > 750000000,
      negotiableLoan: loanAmount > 750000000,
      firstHomeApplied: firstHomeEligible,
      firstHomeBlocked: firstHomeBlocked,
      sst: !!input.sst,
      present: present,
    };
  }

  function professional(ringgit, discountPct) {
    const scale = tableA(sen(ringgit));
    const d = applyDiscount(scale, discountPct, true);
    return {
      scale: rm(scale),
      fee: rm(d.fee),
      pct: d.pct,
      held: d.held,
      discount: rm(d.discount),
    };
  }

  const VENDOR_FEES = [
    { id: "spa", label: "Sale and Purchase Agreement", auto: "spa" },
    { id: "ckht1a", label: "CKHT 1A (RM500 per person)", auto: "each", each: 500 },
    { id: "ckht3", label: "CKHT 3 (RM200 per person)", auto: "each", each: 200 },
    { id: "sd", label: "Statutory Declaration", def: 150 },
    { id: "doc", label: "Discharge of Charge", def: 400 },
  ];

  const PURCHASER_FEES = [
    { id: "spa", label: "Sale and Purchase Agreement", auto: "spa" },
    { id: "ckht2a", label: "CKHT 2A (RM200 per person)", auto: "each", each: 200 },
    { id: "sd", label: "Statutory Declaration", def: 150 },
    { id: "loanFee", label: "Loan Agreement and Charge", auto: "loan", loan: true },
  ];

  const VENDOR_DISB = [
    { id: "land", label: "Land Search", def: 100 },
    { id: "bkr", label: "Bankruptcy Search / Winding Up Search", def: 50 },
    { id: "affirm", label: "Affirmation Fee", def: 100 },
    { id: "ctc", label: "Certified True Copy of Title / Carian Rasmi", def: null },
    { id: "stampDoc", label: "Stamping Fee for Discharge of Charge", def: 20 },
    { id: "regDoc", label: "Registration Fee for Discharge of Charge", def: 120 },
    { id: "photo", label: "Photocopy & Printing Charges", def: 150 },
    { id: "post", label: "Postage and Courier Charges", def: 100 },
    { id: "tel", label: "Telephone and Facsimile Charges", def: 100 },
    { id: "travel", label: "Travelling Charges", def: 300 },
  ];

  const PURCHASER_DISB = [
    { id: "land", label: "Land Search", def: 100 },
    { id: "bkr", label: "Bankruptcy Search / Winding Up Search", def: 50 },
    { id: "affirm", label: "Affirmation Fee", def: 100 },
    { id: "ctc", label: "Certified True Copy of Title / Carian Rasmi", def: null },
    { id: "mot", label: "Stamp Duty on Transfer", auto: "mot" },
    { id: "regMot", label: "Registration Fee for Transfer", def: 100 },
    { id: "loanDuty", label: "Stamp Duty on Loan Agreement", auto: "loanDuty", loan: true },
    { id: "regCharge", label: "Registration Fee for Charge", def: 100, loan: true },
    { id: "photo", label: "Photocopy & Printing Charges", def: 150 },
    { id: "post", label: "Postage and Courier Charges", def: 100 },
    { id: "tel", label: "Telephone and Facsimile Charges", def: 100 },
    { id: "travel", label: "Travelling Charges", def: 300 },
  ];

  function catalog(party) {
    if (party === "purchaser") return { fees: PURCHASER_FEES, disb: PURCHASER_DISB };
    return { fees: VENDOR_FEES, disb: VENDOR_DISB };
  }

  function moneyOrNull(v) {
    if (v == null || v === "") return null;
    const n = Number(v);
    if (!isFinite(n)) return null;
    return sen(n);
  }

  function quote(input) {
    input = input || {};
    const party = input.party === "purchaser" ? "purchaser" : "vendor";
    const price = sen(input.price);
    const persons = Math.max(0, Math.round(isFinite(Number(input.persons)) ? Number(input.persons) : 1));
    let discountPct = Number(input.discountPct);
    if (!isFinite(discountPct) || discountPct < 0) discountPct = 0;
    if (discountPct > 80) discountPct = 80;
    const buyer = input.buyer || "citizen";
    const loanOn = party === "purchaser" && !!input.loanOn;
    const sstOn = !!input.sst;
    const cat = catalog(party);
    const overrides = input.overrides || {};

    const spaScale = price > 0 ? tableA(price) : 0;
    const spaDisc = applyDiscount(spaScale, discountPct, true);
    let loanAmount = 0;
    if (loanOn) {
      if (input.loanAmount == null || input.loanAmount === "") loanAmount = price > 0 ? roundSen(price * 0.9) : 0;
      else loanAmount = sen(Number(input.loanAmount));
    }
    const loanScale = loanAmount > 0 ? tableA(loanAmount) : 0;
    const loanDisc = applyDiscount(loanScale, discountPct, true);

    const assessed = price;
    const firstHomeEligible = !!input.firstHome && buyer === "citizen" && assessed > 0 && assessed <= 50000000;
    const firstHomeBlocked = !!input.firstHome && !firstHomeEligible && price > 0;
    const mot = price > 0 && !firstHomeEligible ? motDuty(price, buyer) : 0;
    const dutyLoan = loanAmount > 0 && !firstHomeEligible ? loanDuty(loanAmount) : 0;

    function autoCents(item) {
      if (item.auto === "spa") return spaDisc.fee;
      if (item.auto === "loan") return loanDisc.fee;
      if (item.auto === "each") return sen(item.each * persons);
      if (item.auto === "mot") return mot;
      if (item.auto === "loanDuty") return dutyLoan;
      return moneyOrNull(item.def);
    }

    function finish(item) {
      let excl = Object.prototype.hasOwnProperty.call(overrides, item.id) ? moneyOrNull(overrides[item.id]) : autoCents(item);
      let sstAmt = null;
      let inc = null;
      if (excl != null) {
        if (sstOn && item.section === "fee") sstAmt = roundSen((excl * 8) / 100);
        inc = excl + (sstAmt || 0);
      }
      return {
        id: item.id,
        label: item.label,
        section: item.section,
        auto: item.auto || null,
        excl: excl == null ? null : rm(excl),
        sst: sstAmt == null ? null : rm(sstAmt),
        inc: inc == null ? null : rm(inc),
      };
    }

    function visible(list, section) {
      const rows = [];
      list.forEach((item) => {
        if (item.loan && !loanOn) return;
        rows.push(finish(Object.assign({ section: section }, item)));
      });
      return rows;
    }

    const fees = visible(cat.fees, "fee");
    const disb = visible(cat.disb, "disb");

    function sum(rows, key) {
      let cents = 0;
      let any = false;
      rows.forEach((row) => {
        if (row[key] == null) return;
        any = true;
        cents += sen(row[key]);
      });
      return any ? rm(cents) : 0;
    }

    const feeExcl = sum(fees, "excl");
    const feeSst = sstOn ? sum(fees, "sst") : null;
    const feeInc = sum(fees, "inc");
    const disbExcl = sum(disb, "excl");
    const disbSst = null;
    const disbInc = sum(disb, "inc");
    const grandExcl = rm(sen(feeExcl) + sen(disbExcl));
    const grandSst = sstOn ? feeSst : null;
    const grandInc = rm(sen(feeInc) + sen(disbInc));

    return {
      party: party,
      price: price > 0 ? rm(price) : (input.price === 0 ? 0 : null),
      persons: persons,
      discountPct: discountPct,
      sst: sstOn,
      buyer: buyer,
      loanOn: loanOn,
      loanAmount: loanOn ? rm(loanAmount) : null,
      loanMargin: loanOn && price > 0 ? (loanAmount / price) * 100 : null,
      spaScale: rm(spaScale),
      spaFee: rm(spaDisc.fee),
      spaMinHeld: spaDisc.held && spaScale > 0,
      loanScale: rm(loanScale),
      loanFee: loanOn ? rm(loanDisc.fee) : 0,
      loanMinHeld: loanOn && loanDisc.held && loanScale > 0,
      firstHomeApplied: firstHomeEligible,
      firstHomeBlocked: firstHomeBlocked,
      fees: fees,
      disb: disb,
      feeExcl: feeExcl,
      feeSst: feeSst,
      feeInc: feeInc,
      disbExcl: disbExcl,
      disbSst: disbSst,
      disbInc: disbInc,
      grandExcl: grandExcl,
      grandSst: grandSst,
      grandInc: grandInc,
    };
  }

  return {
    SST_RATE: SST_RATE,
    compute: compute,
    professional: professional,
    quote: quote,
    catalog: catalog,
    transferDuty: function (ringgit, buyer) {
      return rm(motDuty(sen(ringgit), buyer || "citizen"));
    },
    loanDutyRm: function (ringgit) {
      return rm(loanDuty(sen(ringgit)));
    },
    tableA: function (ringgit) {
      return rm(tableA(sen(ringgit)));
    },
    sen: sen,
    rm: rm,
  };
});
