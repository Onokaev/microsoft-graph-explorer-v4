import {
  AccountInfo,
  AuthenticationResult, InteractionRequiredAuthError,
  PopupRequest, SilentRequest
} from '@azure/msal-browser';

import { AUTH_URL, DEFAULT_USER_SCOPES, HOME_ACCOUNT_KEY } from '../../app/services/graph-constants';
import { geLocale } from '../../appLocale';
import { getCurrentUri } from './authUtils';
import IAuthenticationWrapper from './IAuthenticationWrapper';
import { msalApplication } from './msal-app';

const defaultScopes = DEFAULT_USER_SCOPES.split(' ');
const homeAccountKey = HOME_ACCOUNT_KEY;

export class AuthenticationWrapper implements IAuthenticationWrapper {

  private static instance: AuthenticationWrapper;

  public static getInstance(): AuthenticationWrapper {
    if (!AuthenticationWrapper.instance) {
      AuthenticationWrapper.instance = new AuthenticationWrapper()
    }
    return AuthenticationWrapper.instance;
  }

  public getSessionId() {
    const account = this.getAccount();
    if (account) {
      const idTokenClaims: any = account?.idTokenClaims;
      return idTokenClaims?.sid;
    }
    return null;
  }

  public async logIn(sessionId = ''): Promise<AuthenticationResult> {
    try {
      return await this.getAuthResult([], sessionId);
    } catch (error) {
      throw error;
    }
  }

  public logOut() {
    this.deleteHomeAccountId();
    msalApplication.logout();
  }

  public async logOutPopUp() {
    const endSessionEndpoint = (await msalApplication.getDiscoveredAuthority()).endSessionEndpoint;
    (window as any).open(endSessionEndpoint, 'msal', 400, 600);
    this.clearCache();
    this.deleteHomeAccountId();
  }

  /**
 * Generates a new access token from passed in scopes
 * @param {string[]} scopes passed to generate token
 *  @returns {Promise.<AuthenticationResult>}
 */
  public async acquireNewAccessToken(scopes: string[] = []): Promise<AuthenticationResult> {
    try {
      const authResult = await this.loginWithInteraction(scopes);
      return authResult;
    } catch (error) {
      throw error;
    }
  }

  private getAccount(): AccountInfo | undefined {
    if (msalApplication) {
      const allAccounts = msalApplication.getAllAccounts();
      if (allAccounts && allAccounts.length > 0) {
        if (allAccounts.length > 1) {
          const homeAccountId = this.getHomeAccountId();
          if (homeAccountId) {
            return msalApplication.getAccountByHomeId(homeAccountId) || undefined;
          } else {
            this.loginWithInteraction(defaultScopes);
          }
        }
        return allAccounts[0];
      }
    }
    return undefined;
  }

  public async getToken() {
    const silentRequest: SilentRequest = {
      scopes: defaultScopes,
      authority: this.getAuthority(),
      account: this.getAccount()
    };
    try {
      return await msalApplication.acquireTokenSilent(silentRequest);
    } catch (error) {
      throw error;
    }
  }

  private async getAuthResult(scopes: string[] = [], sessionId?: string): Promise<AuthenticationResult> {
    const silentRequest: SilentRequest = {
      scopes: (scopes.length > 0) ? scopes : defaultScopes,
      authority: this.getAuthority(),
      account: this.getAccount()
    };

    try {
      const result = await msalApplication.acquireTokenSilent(silentRequest);
      this.storeHomeAccountId(result.account!);
      return result;
    } catch (error) {
      if (error instanceof InteractionRequiredAuthError || !this.getAccount()) {
        return this.loginWithInteraction(silentRequest.scopes, sessionId);
      } else {
        throw error;
      }
    }
  }

  private getAuthority(): string {
    // support for tenanted endpoint
    const urlParams = new URLSearchParams(location.search);
    let tenant = urlParams.get('tenant');

    if (!tenant) {
      tenant = 'common';
    }

    return `${AUTH_URL}/${tenant}/`;
  }

  private async loginWithInteraction(userScopes: string[], sessionId?: string) {
    const popUpRequest: PopupRequest = {
      scopes: userScopes,
      authority: this.getAuthority(),
      prompt: 'select_account',
      redirectUri: getCurrentUri(),
      extraQueryParameters: { mkt: geLocale }
    };

    if (sessionId) {
      popUpRequest.sid = sessionId;
      delete popUpRequest.prompt;
    }

    try {
      const result = await msalApplication.loginPopup(popUpRequest);
      this.storeHomeAccountId(result.account!);
      return result;
    } catch (error) {
      throw error;
    }
  }

  private storeHomeAccountId(account: AccountInfo): void {
    localStorage.setItem(homeAccountKey, account.homeAccountId);
  }

  private getHomeAccountId(): string | null {
    return localStorage.getItem(homeAccountKey);
  }

  private deleteHomeAccountId(): void {
    localStorage.removeItem(homeAccountKey);
  }

  /**
   * This is an own implementation of the  clearCache() function that is no longer available;
   * to support logging out via Popup which is not currently native to the msal application.
   *
   * It assumes that all msal related keys follow the format:
   * {homeAccountId}.{realm}-login.windows.net-{idtoken/accessToken/refreshtoken}-{realm}
   * and uses either the homeAccountId 'login' to get localstorage keys that contain this
   * identifier
   */
  private clearCache(): void {
    const keyFilter = this.getHomeAccountId() || 'login';
    const msalKeys = Object.keys(localStorage).filter(key => key.includes(keyFilter));
    msalKeys.forEach((item: string) => {
      localStorage.removeItem(item);
    });
  }

}
