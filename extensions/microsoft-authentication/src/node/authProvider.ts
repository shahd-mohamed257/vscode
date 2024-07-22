/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { AccountInfo, AuthenticationResult, PublicClientApplication } from '@azure/msal-node';
import { AuthenticationGetSessionOptions, AuthenticationProvider, AuthenticationProviderAuthenticationSessionsChangeEvent, AuthenticationSession, AuthenticationSessionAccountInformation, env, EventEmitter, LogOutputChannel, SecretStorage, Uri } from 'vscode';
import { Environment } from '@azure/ms-rest-azure-env';
import { CachedPublicClientApplicationManager, PublicClientApplicationCache } from './publicClientCache';
import { AuthServerLoopbackClientAndOpener } from './authServer';
import { UriHandlerLoopbackClient } from '../common/loopbackClientAndOpener';
import { UriEventHandler } from '../UriEventHandler';
import { ICachedPublicClientApplication } from '../common/publicClientCache';

const redirectUri = 'https://vscode.dev/redirect';
const DEFAULT_CLIENT_ID = 'aebc6443-996d-45c2-90f0-388ff96faa56';
const DEFAULT_TENANT = 'organizations';

export class MsalAuthProvider implements AuthenticationProvider {

	private readonly _onDidChangeSessionsEmitter = new EventEmitter<AuthenticationProviderAuthenticationSessionsChangeEvent>();
	onDidChangeSessions = this._onDidChangeSessionsEmitter.event;

	private _publicClientManager: CachedPublicClientApplicationManager = new CachedPublicClientApplicationManager(
		this._secretStorage,
		this._logger,
		(e) => this._handleAccountChange(e)
	);

	// private _sessionIdToAccount = new Map<string, AuthenticationSessionAccountInformation>();

	constructor(
		private readonly _secretStorage: SecretStorage,
		private readonly _disposables: { dispose(): void }[],
		private readonly _logger: LogOutputChannel,
		private readonly _uriHandler: UriEventHandler,
		private readonly _env: Environment = Environment.AzureCloud
	) {
		this._disposables.push(this._onDidChangeSessionsEmitter);
	}

	async initialize(): Promise<void> {
		await this._publicClientManager.initialize();
	}

	private _handleAccountChange({ added, deleted }: { added: AccountInfo[]; deleted: AccountInfo[] }) {
		const process = (a: AccountInfo) => ({
			// This shouldn't be needed
			accessToken: '1234',
			id: a.homeAccountId,
			scopes: [],
			account: {
				id: a.homeAccountId,
				label: a.username
			},
			idToken: a.idToken,
		});
		this._onDidChangeSessionsEmitter.fire({ added: added.map(process), changed: [], removed: deleted.map(process) });
	}

	async getSessions(scopes: string[] | undefined, options?: AuthenticationGetSessionOptions): Promise<AuthenticationSession[]> {
		const modifiedScopes = scopes ? [...scopes] : [];
		const clientId = this.getClientId(modifiedScopes);
		const tenant = this.getTenantId(modifiedScopes);
		this._addCommonScopes(modifiedScopes);
		if (!scopes) {
			const allSessions: AuthenticationSession[] = [];
			for (const cachedPca of this._publicClientManager.getAll()) {
				const sessions = await this.getAllSessionsForPca(cachedPca, modifiedScopes, modifiedScopes, options?.account);
				allSessions.push(...sessions);
			}
			return allSessions;
		}

		const cachedPca = await this.getOrCreatePublicClientApplication(clientId, tenant);
		const sessions = await this.getAllSessionsForPca(cachedPca, scopes, modifiedScopes.filter(s => !s.startsWith('VSCODE_'), options?.account));
		return sessions;

	}

	async createSession(scopes: readonly string[]): Promise<AuthenticationSession> {
		const modifiedScopes = scopes ? [...scopes] : [];
		const clientId = this.getClientId(modifiedScopes);
		const tenant = this.getTenantId(modifiedScopes);
		this._addCommonScopes(modifiedScopes);

		const cachedPca = await this.getOrCreatePublicClientApplication(clientId, tenant);

		// const loopbackClient = new AuthServerLoopbackClientAndOpener();
		let result: AuthenticationResult;
		try {
			result = await cachedPca.pca.acquireTokenInteractive({
				openBrowser: async (url) => { await env.openExternal(Uri.parse(url)); },
				scopes: modifiedScopes,
				// loopbackClient
			});
		} catch (e) {
			const loopbackClient = new UriHandlerLoopbackClient(this._uriHandler);
			result = await cachedPca.pca.acquireTokenInteractive({
				openBrowser: (url) => loopbackClient.openBrowser(url),
				scopes: modifiedScopes,
				loopbackClient
			});
		}

		const session = this.toAuthenticationSession(result, scopes);
		// this._onDidChangeSessionsEmitter.fire({ added: [session], changed: [], removed: [] });
		return session;
	}

	async removeSession(sessionId: string): Promise<void> {
		for (const cachedPca of this._publicClientManager.getAll()) {
			const accounts = cachedPca.accounts;
			for (const account of accounts) {
				if (account.homeAccountId === sessionId) {
					console.log(`MYPREFIX PID:${process.pid} REMOVING...`);
					await cachedPca.pca.getTokenCache().removeAccount(account);
					console.log(`MYPREFIX PID:${process.pid} REMOVED...`);
					// this._onDidChangeSessionsEmitter.fire({
					// 	added: [], changed: [], removed: [{
					// 		accessToken: 'unknown',
					// 		account: { id: sessionId, label: account.username },
					// 		id: sessionId,
					// 		scopes: []
					// 	}]
					// });
					return;
				}
			}
		}
	}

	private async getOrCreatePublicClientApplication(clientId: string, tenant: string): Promise<ICachedPublicClientApplication> {
		const authority = new URL(tenant, this._env.activeDirectoryEndpointUrl).toString();
		return await this._publicClientManager.getOrCreate(clientId, authority);
	}

	private _addCommonScopes(scopes: string[]) {
		if (!scopes.includes('openid')) {
			scopes.push('openid');
		}
		if (!scopes.includes('email')) {
			scopes.push('email');
		}
		if (!scopes.includes('profile')) {
			scopes.push('profile');
		}
		if (!scopes.includes('offline_access')) {
			scopes.push('offline_access');
		}
		return scopes;
	}

	private async getAllSessionsForPca(
		cachedPca: ICachedPublicClientApplication,
		originalScopes: readonly string[],
		scopesToSend: string[],
		accountFilter?: AuthenticationSessionAccountInformation
	): Promise<AuthenticationSession[]> {
		const accounts = accountFilter
			? cachedPca.accounts.filter(a => a.homeAccountId === accountFilter.id)
			: cachedPca.accounts;
		// const results = new Array<AuthenticationResult>();
		const sessions: AuthenticationSession[] = [];
		for (const account of accounts) {
			console.log(`MYPREFIX PID:${process.pid} ACCOUNT:${account.username} ACQUIRING TOKEN...`);
			const result = await cachedPca.pca.acquireTokenSilent({ account, scopes: scopesToSend, redirectUri });
			console.log(`MYPREFIX PID:${process.pid} ACCOUNT:${account.username} ACQUIRED TOKEN...`);
			sessions.push(this.toAuthenticationSession(result, originalScopes));
		}
		// const results = await Promise.allSettled(accounts.map(async account => {
		// 	console.log(`MYPREFIX PID:${process.pid} ACCOUNT:${account.username} ACQUIRING TOKEN...`);
		// 	const result = await cachedPca.pca.acquireTokenSilent({ account, scopes: scopesToSend, redirectUri });
		// 	console.log(`MYPREFIX PID:${process.pid} ACCOUNT:${account.username} ACQUIRED TOKEN...`);
		// 	return result;
		// }));
		// for (const result of results) {
		// 	if (result.status === 'fulfilled') {
		// 		sessions.push(this.toAuthenticationSession(result.value, originalScopes));
		// 	} else {
		// 		console.error(result.reason);
		// 	}
		// }
		return sessions;
	}

	//#region scope parsers

	private getClientId(scopes: string[]) {
		return scopes.reduce<string | undefined>((prev, current) => {
			if (current.startsWith('VSCODE_CLIENT_ID:')) {
				return current.split('VSCODE_CLIENT_ID:')[1];
			}
			return prev;
		}, undefined) ?? DEFAULT_CLIENT_ID;
	}

	private getTenantId(scopes: string[]) {
		return scopes.reduce<string | undefined>((prev, current) => {
			if (current.startsWith('VSCODE_TENANT:')) {
				return current.split('VSCODE_TENANT:')[1];
			}
			return prev;
		}, undefined) ?? DEFAULT_TENANT;
	}

	//#endregion

	private toAuthenticationSession(result: AuthenticationResult, scopes: readonly string[]): AuthenticationSession & { idToken: string } {
		return {
			accessToken: result.accessToken,
			idToken: result.idToken,
			id: result.account?.homeAccountId ?? result.uniqueId,
			account: {
				id: result.idToken,
				label: result.account?.username ?? 'Unknown',
			},
			scopes
		};
	}
}
