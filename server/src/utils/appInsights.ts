import * as appInsights from 'applicationinsights';
if (process.env.NODE_ENV === 'production') {
  appInsights
    .setup(process.env.APP_INSIGHTS_CONNECTION_STRING)
    .setAutoCollectConsole(true)
    .setAutoCollectDependencies(true)
    .setAutoCollectExceptions(true)
    .setAutoCollectPerformance(true, true)
    .setAutoCollectRequests(true)
    .setAutoDependencyCorrelation(true)
    .setDistributedTracingMode(appInsights.DistributedTracingModes.AI_AND_W3C)
    .setSendLiveMetrics(true)
    .setUseDiskRetryCaching(true)
    .enableWebInstrumentation(true);
  appInsights.start();
}
export default appInsights;
const appInsightsClient = appInsights.defaultClient;
export { appInsightsClient };
