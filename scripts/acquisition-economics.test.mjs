import {test} from 'node:test';
import assert from 'node:assert/strict';
import {acquisitionEconomics,appStoreCampaignLink} from './acquisition-economics.mjs';

const window = {cohortId:'paid-test/ios/US/first-time',start:'2026-01-01T00:00:00Z',end:'2026-02-01T00:00:00Z'};
const now = new Date('2026-04-01T00:00:00Z');
const cohort = () => ({spendUSD:10,adRevenueUSD:5,netPurchaseRevenueUSD:15,variableCostsUSD:1,
  attributedFirstTimeInstalls:10,additionalSpendLimitUSD:25,paybackDays:30,
  spendWindow:window,installWindow:window,revenueCohort:{...window,latestFirstTimeInstallAt:'2026-01-31T23:59:59Z',observedThrough:'2026-03-03T00:00:00Z',includedInstallAgeDays:30,fixedInstallAgeRevenueVerified:true},
  acquisitionAttributionVerified:true,revenueAttributionVerified:true,instrumentationVerified:true,
  releaseVerified:true,campaignLinksVerified:true});

test('uses net cohort earnings and a margin without projecting LTV',() => {
  const report = acquisitionEconomics(cohort());
  assert.equal(report.netRevenueUSD,19);
  assert.equal(report.costPerAttributedInstallUSD,1);
  assert.equal(report.observedRevenueToCost,1.9);
  assert.equal(report.targetMaxCostPerInstallUSD,1.9 / 1.5);
  assert.equal(report.lifetimeValueUSD,null);
  assert.equal(report.decision,'eligible_for_review');
});

test('zero budget keeps even a profitable cohort paused',() => {
  assert.equal(acquisitionEconomics({...cohort(),additionalSpendLimitUSD:0}).decision,'keep_paused');
});

test('unattributed or differently dated totals never become paid CAC or ROAS',() => {
  for (const change of [{acquisitionAttributionVerified:false},{revenueAttributionVerified:false},
    {revenueCohort:{...cohort().revenueCohort,end:'2026-02-02T00:00:00Z'}},
    {installWindow:{...window,cohortId:'organic/ios/US/first-time'}}]) {
    const report = acquisitionEconomics({...cohort(),...change});
    assert.equal(report.costPerAttributedInstallUSD,null);
    assert.equal(report.observedRevenueToCost,null);
    assert.equal(report.decision,'capped_research_only');
  }
});

test('immature cohorts and losses cannot qualify for scaling',() => {
  const early = acquisitionEconomics({...cohort(),observationDays:999,revenueCohort:{...cohort().revenueCohort,observedThrough:'2026-02-04T00:00:00Z'}});
  assert.equal(early.decision,'capped_research_only');
  assert.equal(early.targetMaxCostPerInstallUSD,null);
  assert.equal(early.minimumObservationDays,3);
  assert.equal(early.cohortMature,false);
  const loss = acquisitionEconomics({...cohort(),variableCostsUSD:25});
  assert.equal(loss.netRevenueUSD,-5);
  assert.equal(loss.targetMaxCostPerInstallUSD,0);
  assert.equal(loss.decision,'capped_research_only');
});

test('revenue after acquisition is valid and youngest install determines maturity',() => {
  const report = acquisitionEconomics(cohort(),{now});
  assert.equal(report.minimumObservationDays,30);
  assert.equal(report.cohortMature,true);
  assert.equal(report.decision,'eligible_for_review');
  // Forty days after the first install is still only nine after the youngest.
  const early = acquisitionEconomics({...cohort(),revenueCohort:{...cohort().revenueCohort,observedThrough:'2026-02-10T00:00:00Z'}},{now});
  assert.equal(early.minimumObservationDays,9);
  assert.equal(early.targetMaxCostPerInstallUSD,null);
});

test('different calendar representations of the same acquisition interval match',() => {
  const report = acquisitionEconomics({...cohort(),installWindow:{...window,start:'2025-12-31T14:00:00-10:00',end:'2026-01-31T14:00:00-10:00'}},{now});
  assert.equal(report.costPerAttributedInstallUSD,1);
});

test('downloads attributed after campaign delivery cannot overstate youngest cohort age',() => {
  const report = acquisitionEconomics({...cohort(),revenueCohort:{...cohort().revenueCohort,latestFirstTimeInstallAt:'2026-02-02T00:00:00Z'}},{now});
  assert.equal(report.minimumObservationDays,29);
  assert.equal(report.cohortMature,false);
  assert.equal(report.targetMaxCostPerInstallUSD,null);
  assert.equal(report.decision,'capped_research_only');
});

test('mixed-age all-time revenue cannot become a payback ceiling',() => {
  for (const change of [{fixedInstallAgeRevenueVerified:false},{includedInstallAgeDays:60}]) {
    const report = acquisitionEconomics({...cohort(),revenueCohort:{...cohort().revenueCohort,...change}},{now});
    assert.equal(report.cohortMature,true);
    assert.equal(report.observedRevenueToCost,1.9);
    assert.equal(report.targetMaxCostPerInstallUSD,null);
    assert.equal(report.decision,'capped_research_only');
  }
});

test('missing cohort or observation metadata keeps ratios unavailable',() => {
  for (const change of [{revenueCohort:undefined},{spendWindow:undefined},
    {revenueCohort:{...cohort().revenueCohort,observedThrough:undefined}},
    {revenueCohort:{...cohort().revenueCohort,latestFirstTimeInstallAt:undefined}}]) {
    const report = acquisitionEconomics({...cohort(),...change},{now});
    assert.equal(report.observedRevenueToCost,null);
    assert.equal(report.targetMaxCostPerInstallUSD,null);
  }
});

test('invalid or future cutoffs and partial acquisition observations are rejected',() => {
  for (const observedThrough of ['2026-01-20T00:00:00Z','2026-04-02T00:00:00Z','2026-03-03','2026-02-30T00:00:00Z','not-a-date']) {
    assert.throws(() => acquisitionEconomics({...cohort(),revenueCohort:{...cohort().revenueCohort,observedThrough}},{now}));
  }
  assert.throws(() => acquisitionEconomics({...cohort(),installWindow:{...window,start:window.end}},{now}));
  assert.throws(() => acquisitionEconomics({...cohort(),installWindow:{...window,cohortId:42}},{now}));
  for (const latestFirstTimeInstallAt of ['2025-12-31T00:00:00Z','2026-03-04T00:00:00Z']) {
    assert.throws(() => acquisitionEconomics({...cohort(),revenueCohort:{...cohort().revenueCohort,latestFirstTimeInstallAt}},{now}));
  }
});

test('zero spend produces no artificial infinite return multiple',() => {
  const report = acquisitionEconomics({...cohort(),spendUSD:0},{now});
  assert.equal(report.costPerAttributedInstallUSD,0);
  assert.equal(report.observedRevenueToCost,null);
  assert.equal(report.decision,'capped_research_only');
});

test('missing release, links or instrumentation prevents any new delivery',() => {
  for (const key of ['releaseVerified','campaignLinksVerified','instrumentationVerified']) {
    assert.equal(acquisitionEconomics({...cohort(),[key]:false}).decision,'keep_paused');
  }
});

test('zero installs and invalid accounting cannot manufacture ratios',() => {
  assert.equal(acquisitionEconomics({...cohort(),attributedFirstTimeInstalls:0}).costPerAttributedInstallUSD,null);
  for (const change of [{spendUSD:-1},{adRevenueUSD:NaN},{attributedFirstTimeInstalls:1.5},
    {paybackDays:0},{revenueToCostTarget:1}]) assert.throws(() => acquisitionEconomics({...cohort(),...change}));
});

test('requires explicit valid-format App Store identifiers and a nonempty campaign token',() => {
  const link = new URL(appStoreCampaignLink({appId:'1234567890',providerToken:'12345',campaign:'cac_test2_gameplay'}));
  assert.equal(link.origin,'https://apps.apple.com');
  assert.equal(link.searchParams.get('ct'),'cac_test2_gameplay');
  assert.equal(link.searchParams.get('pt'),'12345');
  assert.throws(() => appStoreCampaignLink({appId:'1234567890',campaign:'cac_test2_gameplay'}));
  assert.throws(() => appStoreCampaignLink({appId:'1234567890',providerToken:'12345',campaign:'a'.repeat(31)}));
  assert.throws(() => appStoreCampaignLink({appId:'1234567890',providerToken:'12345'}));
  assert.throws(() => appStoreCampaignLink({appId:'1234567890',providerToken:'12345',campaign:'   '}));
});
