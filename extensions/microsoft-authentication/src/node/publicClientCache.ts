/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AccountInfo, Configuration, PublicClientApplication } from '@azure/msal-node';
import { SecretStorageCachePlugin } from '../common/cachePlugin';
import { SecretStorage, LogOutputChannel, Disposable, SecretStorageChangeEvent, EventEmitter, Event } from 'vscode';
import { MsalLoggerOptions } from '../common/loggerOptions';
import { ICachedPublicClientApplication, ICachedPublicClientApplicationManager } from 'src/common/publicClientCache';

export interface IPublicClientApplicationInfo {
	clientId: string;
	authority: string;
}

export interface IPublicClientApplicationCacheChangedEvent {
	deleted?: IPublicClientApplicationInfo[];
	addedOrChanged?: IPublicClientApplicationInfo[];
}

const _keyPrefix = 'pca:';

export class PublicClientApplicationCache implements Disposable {
	// Key prefix used to identify the PCA infos in the secret storage
	private static _keyPrefix = 'pca:';

	// The key is the clientId and authority stringified
	private readonly _pcas: Map<string, PublicClientApplication> = new Map();

	private _initialized = false;
	private _disposable: Disposable;

	private _onDidChange = new EventEmitter<{ deleted?: IPublicClientApplicationInfo[]; addedOrChanged?: IPublicClientApplicationInfo[] }>();
	onDidChange = this._onDidChange.event;

	constructor(
		private readonly _secretStorage: SecretStorage,
		private readonly _output: LogOutputChannel
	) {
		this._disposable = _secretStorage.onDidChange(e => this._handleCacheChange(e));
	}

	private async _handleCacheChange(e: SecretStorageChangeEvent) {
		if (e.key.startsWith(_keyPrefix)) {
			const result = await this._secretStorage.get(e.key);
			const pcasKey = e.key.split(_keyPrefix)[1];

			// If the cache was deleted, remove the PCA
			if (!result) {
				this._pcas.delete(pcasKey);
				await this._storePublicClientApplications();
				return;
			}

			// Load the PCA in memory if it's not already loaded
			const { clientId, authority } = JSON.parse(pcasKey) as IPublicClientApplicationInfo;
			this.getOrCreate(clientId, authority);
		}
	}

	async initialize() {
		const keys = await this._secretStorage.get('publicClientApplications');
		if (!keys) {
			this._initialized = true;
			return;
		}

		try {
			for (const key of JSON.parse(keys) as string[]) {
				try {
					const { clientId, authority } = JSON.parse(key) as IPublicClientApplicationInfo;
					// Load the PCA in memory
					this.getOrCreate(clientId, authority);
				} catch (e) {
					// ignore
				}
			}
		} catch (e) {
			// data is corrupted
			await this._secretStorage.delete('publicClientApplications');
		}
		this._initialized = true;
	}

	dispose() {
		this._disposable.dispose();
	}

	getOrCreate(clientId: string, authority: string): PublicClientApplication {
		if (!this._initialized) {
			throw new Error('PublicClientApplicationCache not initialized');
		}

		// Use the clientId and authority as the key
		const pcasKey = JSON.stringify({ clientId, authority });
		let pca = this._pcas.get(pcasKey);
		if (pca) {
			return pca;
		}

		const loggerOptions = new MsalLoggerOptions(this._output);
		const config: Configuration = {
			auth: { clientId, authority },
			system: {
				loggerOptions: {
					loggerCallback: (level, message, containsPii) => loggerOptions.loggerCallback(level, message, containsPii),
				}
			},
			cache: {
				cachePlugin: new SecretStorageCachePlugin(
					this._secretStorage,
					// Include the prefix in the key so we can easily identify it later
					`${PublicClientApplicationCache._keyPrefix}${JSON.stringify({ clientId, authority })}`
				)
			}
		};
		pca = new PublicClientApplication(config);
		this._pcas.set(pcasKey, pca);
		return pca;
	}

	getAll(): PublicClientApplication[] {
		if (!this._initialized) {
			throw new Error('PublicClientApplicationCache not initialized');
		}
		return Array.from(this._pcas.values());
	}

	private async _storePublicClientApplications() {
		await this._secretStorage.store(
			'publicClientApplications',
			JSON.stringify(Array.from(this._pcas.keys()))
		);
	}
}

export class CachedPublicClientApplicationManager implements ICachedPublicClientApplicationManager {
	// The key is the clientId and authority stringified
	private readonly _pcas = new Map<string, CachedPublicClientApplication>();
	private readonly _pcaDisposables = new Map<string, Disposable>();

	private _initialized = false;
	private _disposable: Disposable;

	constructor(
		private readonly _secretStorage: SecretStorage,
		private readonly _output: LogOutputChannel,
		private readonly _accountChangeHandler: (e: { added: AccountInfo[]; deleted: AccountInfo[] }) => void
	) {
		this._disposable = _secretStorage.onDidChange(e => this._handleCacheChange(e));
	}

	async initialize() {
		const keys = await this._secretStorage.get('publicClientApplications');
		if (!keys) {
			this._initialized = true;
			return;
		}

		const promises = new Array<Promise<ICachedPublicClientApplication>>();
		try {
			for (const key of JSON.parse(keys) as string[]) {
				try {
					const { clientId, authority } = JSON.parse(key) as IPublicClientApplicationInfo;
					// Load the PCA in memory
					promises.push(this.getOrCreate(clientId, authority));
				} catch (e) {
					// ignore
				}
			}
		} catch (e) {
			// data is corrupted
			await this._secretStorage.delete('publicClientApplications');
		}

		// TODO: should we do anything for when this fails?
		await Promise.allSettled(promises);
		this._initialized = true;
	}

	dispose() {
		this._disposable.dispose();
		// TODO dispose of the pcas disposables
	}

	async getOrCreate(clientId: string, authority: string): Promise<ICachedPublicClientApplication> {
		if (!this._initialized) {
			throw new Error('PublicClientApplicationCache not initialized');
		}

		// Use the clientId and authority as the key
		const pcasKey = JSON.stringify({ clientId, authority });
		let pca = this._pcas.get(pcasKey);
		if (pca) {
			return pca;
		}

		pca = new CachedPublicClientApplication(clientId, authority, this._secretStorage, this._output);
		this._pcas.set(pcasKey, pca);
		this._pcaDisposables.set(pcasKey, Disposable.from(
			pca,
			pca.onDidChange(this._accountChangeHandler)
		));
		await pca.initialize();
		return pca;
	}

	getAll(): ICachedPublicClientApplication[] {
		if (!this._initialized) {
			throw new Error('PublicClientApplicationCache not initialized');
		}
		return Array.from(this._pcas.values());
	}

	private async _handleCacheChange(e: SecretStorageChangeEvent) {
		if (e.key.startsWith(_keyPrefix)) {
			const result = await this._secretStorage.get(e.key);
			const pcasKey = e.key.split(_keyPrefix)[1];

			// If the cache was deleted, remove the PCA
			if (!result) {
				this._pcas.delete(pcasKey);
				await this._storePublicClientApplications();
				return;
			}

			// Load the PCA in memory if it's not already loaded
			const { clientId, authority } = JSON.parse(pcasKey) as IPublicClientApplicationInfo;
			this.getOrCreate(clientId, authority);
		}
	}

	private async _storePublicClientApplications() {
		await this._secretStorage.store(
			'publicClientApplications',
			JSON.stringify(Array.from(this._pcas.keys()))
		);
	}
}

class CachedPublicClientApplication implements ICachedPublicClientApplication {
	private readonly _pca: PublicClientApplication;
	private readonly _secretStorageCachePlugin: SecretStorageCachePlugin;

	private _accounts: AccountInfo[] = [];

	private readonly _onDidChange = new EventEmitter<{ added: AccountInfo[]; deleted: AccountInfo[] }>();
	readonly onDidChange = this._onDidChange.event;

	private _disposable: Disposable;

	constructor(
		private readonly _clientId: string,
		private readonly _authority: string,
		private readonly _secretStorage: SecretStorage,
		private readonly _output: LogOutputChannel
	) {
		const loggerOptions = new MsalLoggerOptions(this._output);
		this._secretStorageCachePlugin = new SecretStorageCachePlugin(
			this._secretStorage,
			// Include the prefix in the key so we can easily identify it later
			`${_keyPrefix}${JSON.stringify({ clientId: _clientId, authority: _authority })}`
		);
		const config: Configuration = {
			auth: { clientId: _clientId, authority: _authority },
			system: {
				loggerOptions: {
					loggerCallback: (level, message, containsPii) => loggerOptions.loggerCallback(level, message, containsPii),
				}
			},
			cache: {
				cachePlugin: this._secretStorageCachePlugin
			}
		};
		this._pca = new PublicClientApplication(config);
		this._disposable = this._registerOnSecretStorageChanged();
	}

	get accounts(): AccountInfo[] { return this._accounts; }
	get pca(): PublicClientApplication { return this._pca; }
	get clientId(): string { return this._clientId; }
	get authority(): string { return this._authority; }

	initialize(): Promise<void> {
		return this._update();
	}

	dispose(): void {
		this._disposable.dispose();
	}

	private _registerOnSecretStorageChanged() {
		return this._secretStorageCachePlugin.onDidChange(() => this._update());
	}

	private async _update() {
		const before = this._accounts;
		console.log(`MYPREFIX PID:${process.pid} UPDATING...`);
		// this._pca.clearCache();
		const after = await this._pca.getAllAccounts();
		console.log(`MYPREFIX PID:${process.pid} UPDATED...`);
		this._accounts = after;

		const beforeSet = new Set(before.map(b => b.homeAccountId));
		const afterSet = new Set(after.map(a => a.homeAccountId));

		const added = after.filter(a => !beforeSet.has(a.homeAccountId));
		const deleted = before.filter(b => !afterSet.has(b.homeAccountId));
		this._onDidChange.fire({ added, deleted });
	}
}
