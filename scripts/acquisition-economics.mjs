import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const amount = (value,name) => {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be a nonnegative number.`);
  return value;
};
const dayMs = 86_400_000;
const timestamp = (value,name) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${name} must be an ISO timestamp with a timezone.`);
  }
  const [year,month,day] = value.slice(0,10).split('-').map(Number);
  const [hour,minute,second] = value.slice(11,19).split(':').map(Number);
  if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year,month,0)).getUTCDate() || hour > 23 || minute > 59 || second > 59) {
    throw new Error(`${name} is not a valid calendar timestamp.`);
  }
  return Date.parse(value);
};
const cohortWindow = (value,name) => {
  if (!value || !value.cohortId || !value.start || !value.end) return null;
  if (typeof value.cohortId !== 'string' || !value.cohortId.trim() || value.cohortId.length > 200) throw new Error(`${name}.cohortId is invalid.`);
  const start = timestamp(value.start,`${name}.start`), end = timestamp(value.end,`${name}.end`);
  if (start >= end) throw new Error(`${name} must have a start before its exclusive end.`);
  return {cohortId:value.cohortId,start,end};
};

// This report accepts aggregate, attributed cohort data only. Early revenue is
// never extrapolated into lifetime value, and a research budget is not a profit.
export function acquisitionEconomics(input,{now = new Date()} = {}) {
  const spend = amount(input.spendUSD,'spendUSD');
  const adRevenue = amount(input.adRevenueUSD,'adRevenueUSD');
  const purchases = amount(input.netPurchaseRevenueUSD,'netPurchaseRevenueUSD');
  const costs = amount(input.variableCostsUSD,'variableCostsUSD');
  const limit = amount(input.additionalSpendLimitUSD,'additionalSpendLimitUSD');
  const installs = amount(input.attributedFirstTimeInstalls,'attributedFirstTimeInstalls');
  if (!Number.isSafeInteger(installs)) throw new Error('Install count must be a whole number.');
  const paybackDays = amount(input.paybackDays,'paybackDays');
  if (!paybackDays) throw new Error('Choose a positive payback period.');
  const margin = input.revenueToCostTarget ?? 1.5;
  if (!Number.isFinite(margin) || margin <= 1) throw new Error('Choose a revenue-to-cost target greater than one.');
  const reasons = [];
  if (input.acquisitionAttributionVerified !== true) reasons.push('Paid installs are not verified.');
  if (input.revenueAttributionVerified !== true) reasons.push('Cohort revenue is not verified.');
  const windows = [cohortWindow(input.spendWindow,'spendWindow'),cohortWindow(input.installWindow,'installWindow'),cohortWindow(input.revenueCohort,'revenueCohort')];
  const sameCohort = windows.every(Boolean) && windows.every(window => window.cohortId === windows[0].cohortId && window.start === windows[0].start && window.end === windows[0].end);
  if (!sameCohort) reasons.push('Spend, first-time installs and revenue must identify the same acquisition cohort and interval.');
  let observationDays = null;
  if (!input.revenueCohort?.observedThrough) {
    reasons.push('The cohort revenue observation cutoff is missing.');
  } else {
    const cutoff = timestamp(input.revenueCohort.observedThrough,'revenueCohort.observedThrough');
    const currentTime = new Date(now).getTime();
    if (!Number.isFinite(currentTime)) throw new Error('The current time is invalid.');
    if (cutoff > currentTime) throw new Error('The revenue observation cutoff cannot be in the future.');
    if (windows[2] && cutoff < windows[2].end) throw new Error('The revenue observation cutoff precedes the acquisition interval end.');
    if (!input.revenueCohort.latestFirstTimeInstallAt) {
      reasons.push('The latest attributed first-time installation timestamp is missing.');
    } else {
      const latestInstall = timestamp(input.revenueCohort.latestFirstTimeInstallAt,'revenueCohort.latestFirstTimeInstallAt');
      if (latestInstall > cutoff) throw new Error('The latest first-time install is after the revenue observation cutoff.');
      if (windows[2] && latestInstall < windows[2].start) throw new Error('The latest first-time install precedes its acquisition cohort.');
      // A download may be attributed to a campaign click after delivery ends.
      // Using only the acquisition interval end would overstate its age.
      if (sameCohort) observationDays = (cutoff - Math.max(windows[0].end,latestInstall)) / dayMs;
    }
  }
  if (!installs) reasons.push('There are no verified first-time installs.');
  const measurable = reasons.length === 0;
  const netRevenue = adRevenue + purchases - costs;
  const cpi = measurable ? spend / installs : null;
  const revenuePerInstall = measurable ? netRevenue / installs : null;
  const revenueToCost = measurable && spend > 0 ? netRevenue / spend : null;
  const mature = observationDays !== null && observationDays >= paybackDays;
  // Old installs must not contribute extra months to a nominal D30 revenue
  // comparison. This attestation requires earnings capped per install at the
  // chosen age, after platform fees/refunds and without repeat transaction IDs.
  const paybackRevenueVerified = input.revenueCohort?.fixedInstallAgeRevenueVerified === true &&
    input.revenueCohort?.includedInstallAgeDays === paybackDays;
  const researchReady = input.instrumentationVerified === true && input.releaseVerified === true &&
    input.campaignLinksVerified === true && limit > 0;
  const scaleQualified = researchReady && measurable && mature && paybackRevenueVerified && revenueToCost !== null && revenueToCost >= margin;
  return {
    spendUSD:spend,netRevenueUSD:netRevenue,additionalSpendLimitUSD:limit,
    costPerAttributedInstallUSD:cpi,observedNetRevenuePerInstallUSD:revenuePerInstall,
    observedRevenueToCost:revenueToCost,
    targetMaxCostPerInstallUSD:measurable && mature && paybackRevenueVerified ? Math.max(0,revenuePerInstall / margin) : null,
    minimumObservationDays:observationDays,paybackDays,cohortMature:mature,paybackRevenueVerified,lifetimeValueUSD:null,
    decision:scaleQualified ? 'eligible_for_review' : researchReady ? 'capped_research_only' : 'keep_paused',
    reasons:[...reasons,...(!mature ? ['The cohort has not completed the chosen payback period.'] : []),
      ...(!paybackRevenueVerified ? ['Revenue within the chosen number of days after each install is not verified.'] : []),
      ...(input.instrumentationVerified !== true ? ['Revenue instrumentation is not verified.'] : []),
      ...(input.releaseVerified !== true ? ['The release is not verified.'] : []),
      ...(input.campaignLinksVerified !== true ? ['Campaign links are not verified.'] : []),
      ...(!limit ? ['No additional spending is authorized.'] : [])]
  };
}

export function appStoreCampaignLink({appId,providerToken,campaign}) {
  if (!/^\d{8,12}$/.test(String(appId)) || !/^\d{1,20}$/.test(String(providerToken))) throw new Error('Use the real App Store app ID and provider token from App Store Connect.');
  if (typeof campaign !== 'string' || !campaign.trim() || !/^[A-Za-z0-9_ -]{1,30}$/.test(campaign)) throw new Error('Campaign name must contain 1–30 safe characters.');
  const link = new URL(`https://apps.apple.com/app/id${appId}`);
  link.search = new URLSearchParams({pt:String(providerToken),ct:campaign,mt:'8'}).toString();
  return link.href;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3) throw new Error('Provide one private aggregate JSON input file.');
  console.log(JSON.stringify(acquisitionEconomics(JSON.parse(await readFile(process.argv[2],'utf8'))),null,2));
}
