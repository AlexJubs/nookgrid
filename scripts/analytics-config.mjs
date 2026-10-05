// Public capture configuration is injected only into release artifacts.
// Never accept a personal/admin API key as client configuration.
export function releaseAnalyticsConfig(config, captureToken) {
  if (typeof captureToken !== 'string' || !/^phc_[A-Za-z0-9]{30,150}$/.test(captureToken)) {
    throw new Error('A PostHog public capture token is required in private release configuration.');
  }
  if (!config?.analytics || config.analytics.apiHost !== 'https://us.i.posthog.com') {
    throw new Error('Unknown analytics release configuration.');
  }
  return {...config, analytics:{...config.analytics,enabled:true,projectToken:captureToken}};
}
