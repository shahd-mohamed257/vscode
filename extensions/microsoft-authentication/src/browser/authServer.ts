/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ServerAuthorizationCodeResponse } from '@azure/msal-node';
import { ILoopbackClientAndOpener } from 'src/common/loopbackClientAndOpener';

export function startServer(_: any): any {
	throw new Error('Not implemented');
}

export function createServer(_: any): any {
	throw new Error('Not implemented');
}

export class AuthServerLoopbackClientAndOpener implements ILoopbackClientAndOpener {
	getRedirectUri(): string {
		throw new Error('Not implemented.');
	}
	openBrowser(_url: string): Promise<void> {
		throw new Error('Not implemented.');
	}
	listenForAuthCode(_successTemplate?: string, _errorTemplate?: string): Promise<ServerAuthorizationCodeResponse> {
		throw new Error('Not implemented.');
	}
	closeServer(): void {
		throw new Error('Not implemented.');
	}
}
