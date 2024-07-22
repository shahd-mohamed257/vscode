/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ILoopbackClient, ServerAuthorizationCodeResponse } from '@azure/msal-node';
import { redirectUrl } from './constants';
import type { UriEventHandler } from '../UriEventHandler';
import { env, Uri } from 'vscode';

export interface ILoopbackClientAndOpener extends ILoopbackClient {
	openBrowser(url: string): Promise<void>;
}

export class UriHandlerLoopbackClient implements ILoopbackClientAndOpener {
	constructor(private readonly _uriHandler: UriEventHandler) { }

	async listenForAuthCode(successTemplate?: string, errorTemplate?: string): Promise<ServerAuthorizationCodeResponse> {
		console.log(successTemplate, errorTemplate);
		const url = await this._uriHandler.waitForUri();
		const result = new URL(url.toString(true));

		return {
			code: result.searchParams.get('code') ?? undefined,
			state: result.searchParams.get('state') ?? undefined,
			error: result.searchParams.get('error') ?? undefined,
			error_description: result.searchParams.get('error_description') ?? undefined,
			error_uri: result.searchParams.get('error_uri') ?? undefined,
		};
	}

	getRedirectUri(): string {
		// We always return the constant redirect URL because
		// it will handle redirecting back to the extension
		return redirectUrl;
	}

	closeServer(): void {
		// No-op
	}

	async openBrowser(url: string): Promise<void> {
		const callbackUri = await env.asExternalUri(Uri.parse(`${env.uriScheme}://vscode.microsoft-authentication`));

		const uri = Uri.parse(url + `&state=${encodeURI(callbackUri.toString(true))}`);
		await env.openExternal(uri);
	}
}
