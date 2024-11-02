import { NavigationClient } from '@azure/msal-browser';
import { App as CapacitorApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';

export class CustomNavigationClient extends NavigationClient {
  msalInstance: any;
  constructor(msalInstance: any) {
    super();
    this.msalInstance = msalInstance;
  }
  async navigateExternal(url: string, options: any) {
    // @ts-ignore
    if (window.Capacitor) {
      await Browser.open({ url });

      const appUrlOpenListener = (data: any) => {
        if (data.url && data.url.includes('#state')) {
          Browser.close();

          const hashIndex = data.url.indexOf('#');

          if (hashIndex === -1) {
            return null;
          }

          const hash = data.url.substring(hashIndex);
          this.msalInstance.handleRedirectPromise(hash).then((res: any) => {
            localStorage.setItem('accessToken', res.accessToken);
          });
        } else if (data.url && data.url.includes('onboarding')) {
          Browser.close();
        }
      };
      CapacitorApp.addListener('appUrlOpen', appUrlOpenListener);

      return true;
    } else {
      if (options.noHistory) {
        window.location.replace(url);
      } else {
        window.location.assign(url);
      }
      return true;
    }
  }
}
