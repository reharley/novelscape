import { ClickAnalyticsPlugin } from '@microsoft/applicationinsights-clickanalytics-js';
import { ReactPlugin } from '@microsoft/applicationinsights-react-js';
import {
  ApplicationInsights,
  DistributedTracingModes,
} from '@microsoft/applicationinsights-web';
import { createBrowserHistory } from 'history';

const reactPlugin = new ReactPlugin();
let appInsights: ApplicationInsights | undefined;
const clickPluginInstance = new ClickAnalyticsPlugin();
const clickPluginConfig = {
  autoCapture: true,
};

const initializeAppInsights = () => {
  const customHistory = createBrowserHistory();
  appInsights = new ApplicationInsights({
    config: {
      connectionString: process.env.REACT_APP_INSIGHTS_CONNECTION_STRING,
      extensions: [reactPlugin, clickPluginInstance],
      namePrefix: process.env.REACT_APP_INSIGHTS_NAME,
      extensionConfig: {
        [reactPlugin.identifier]: {
          history: customHistory,
        },
        [clickPluginInstance.identifier]: clickPluginConfig,
      },
      enableAutoRouteTracking: true,
      enableCorsCorrelation: true,
      correlationHeaderExcludedDomains: [
        'https://orca-back-api.azurewebsites.net',
      ],
      distributedTracingMode: DistributedTracingModes.AI_AND_W3C,
      disableTelemetry: false,
    },
  });

  appInsights.loadAppInsights();
};

if (process.env.NODE_ENV === 'production') initializeAppInsights();

export { appInsights, reactPlugin };
