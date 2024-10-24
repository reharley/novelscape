import {
  AzureMonitorOpenTelemetryOptions,
  useAzureMonitor,
} from '@azure/monitor-opentelemetry';
import * as appInsights from 'applicationinsights';

let appInsightsClient: appInsights.TelemetryClient;

function getAppInsightsClient() {
  if (!appInsightsClient) {
    const options: AzureMonitorOpenTelemetryOptions = {
      azureMonitorExporterOptions: {
        connectionString: process.env.APPLICATIONINSIGHTS_CONNECTION_STRING,
      },
    };
    useAzureMonitor(options);
    if (process.env.NODE_ENV === 'production') {
      appInsights
        .setup(process.env.APPLICATIONINSIGHTS_CONNECTION_STRING)
        .setAutoCollectConsole(true)
        .setAutoCollectDependencies(true)
        .setAutoCollectExceptions(true)
        .setAutoCollectPerformance(true, true)
        .setAutoCollectRequests(true)
        .setAutoDependencyCorrelation(true)
        .setDistributedTracingMode(
          appInsights.DistributedTracingModes.AI_AND_W3C
        )
        // .setSendLiveMetrics(true)
        .setUseDiskRetryCaching(true)
        .enableWebInstrumentation(true);
      appInsights.start();
    }
    appInsightsClient = appInsights.defaultClient;
  }
  return appInsightsClient;
}
getAppInsightsClient();
export default appInsights;
export { getAppInsightsClient };
