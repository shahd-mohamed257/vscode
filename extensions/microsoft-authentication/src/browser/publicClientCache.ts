/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { PublicClientApplication } from '@azure/msal-node';
import { IPublicClientApplicationCache } from 'src/common/publicClientCache';

export class PublicClientApplicationCache implements IPublicClientApplicationCache {
	getOrCreate(_clientId: string, _authority: string): PublicClientApplication {
		throw new Error('Not implemented.');
	}
	getAll(): PublicClientApplication[] {
		throw new Error('Not implemented.');
	}
}
