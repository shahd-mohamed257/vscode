/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type { AccountInfo, AuthenticationResult, PublicClientApplication } from '@azure/msal-node';
import { AuthenticationSession, Event } from 'vscode';

export interface IPublicClientApplicationCache {
	getOrCreate(clientId: string, authority: string): PublicClientApplication;
	getAll(): PublicClientApplication[];
}



export interface ICachedPublicClientApplication {
	initialize(): Promise<void>;
	accounts: AccountInfo[];
	pca: PublicClientApplication;
	clientId: string;
	authority: string;
	onDidChange: Event<{ added: AccountInfo[]; deleted: AccountInfo[] }>;
}

export interface ICachedPublicClientApplicationManager {
	getOrCreate(clientId: string, authority: string): Promise<ICachedPublicClientApplication>;
	getAll(): ICachedPublicClientApplication[];
}
