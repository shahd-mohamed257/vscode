/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICachePlugin, TokenCacheContext } from '@azure/msal-node';
import { DeferredPromise, Queue } from './async';
import { Disposable, EventEmitter, SecretStorage } from 'vscode';

export class SecretStorageCachePlugin implements ICachePlugin {
	private readonly _onDidChange: EventEmitter<void> = new EventEmitter<void>();
	readonly onDidChange = this._onDidChange.event;

	private _queue = new Queue<void>();
	private _map = new Map<TokenCacheContext, DeferredPromise<void>>();

	private _disposable: Disposable;

	private _value: string | undefined;

	constructor(
		private readonly _secretStorage: SecretStorage,
		private readonly _key: string
	) {
		this._disposable = Disposable.from(
			this._onDidChange,
			this._registerChangeHandler()
		);
	}

	private _registerChangeHandler() {
		return this._secretStorage.onDidChange(e => {
			if (e.key === this._key) {
				console.log(`MYPREFIX PID:${process.pid} Event fired...`);
				this._onDidChange.fire();
			}
		});
	}

	async beforeCacheAccess(tokenCacheContext: TokenCacheContext): Promise<void> {
		console.log(`MYPREFIX PID:${process.pid} GETTING...`);
		const data = await this._secretStorage.get(this._key);
		console.log(`MYPREFIX PID:${process.pid} GOT...`);
		this._value = data;
		if (data) {
			console.log(`MYPREFIX PID:${process.pid} A HAS_MSFT:` + data.includes('Tyler Leonhardt (VSCODE)'));
			tokenCacheContext.tokenCache.deserialize(data);
		}
	}

	async afterCacheAccess(tokenCacheContext: TokenCacheContext): Promise<void> {
		if (tokenCacheContext.cacheHasChanged) {
			const value = tokenCacheContext.tokenCache.serialize();
			console.log(`MYPREFIX PID:${process.pid} B HAS_MSFT:` + value.includes('Tyler Leonhardt (VSCODE)'));
			if (value !== this._value) {
				console.log(`MYPREFIX PID:${process.pid} STORING...`);
				await this._secretStorage.store(this._key, value);
				console.log(`MYPREFIX PID:${process.pid} STORED...`);
			}
		}
	}

	dispose() {
		this._disposable.dispose();
	}
}


// export class SecretStorageCachePlugin implements ICachePlugin {
// 	private readonly _onDidChange: EventEmitter<void> = new EventEmitter<void>();
// 	readonly onDidChange = this._onDidChange.event;

// 	private _disposable: Disposable;
// 	private _value: string | undefined;

// 	constructor(
// 		private readonly _secretStorage: SecretStorage,
// 		private readonly _key: string
// 	) {
// 		this._disposable = Disposable.from(
// 			this._onDidChange,
// 			this._registerChangeHandler()
// 		);
// 	}

// 	private _registerChangeHandler() {
// 		return this._secretStorage.onDidChange(async e => {
// 			if (e.key === this._key) {
// 				const current = await this._secretStorage.get(this._key);
// 				if (current !== this._value) {
// 					this._value = current;
// 					this._onDidChange.fire();
// 				}
// 			}
// 		});
// 	}

// 	async beforeCacheAccess(tokenCacheContext: TokenCacheContext): Promise<void> {
// 		const data = await this._secretStorage.get(this._key);
// 		await this._update(data);
// 		if (this._value !== data) {
// 			if (data) {
// 				tokenCacheContext.tokenCache.deserialize(data);
// 			}
// 			this._value = data;
// 		}
// 	}

// 	async afterCacheAccess(tokenCacheContext: TokenCacheContext): Promise<void> {
// 		if (tokenCacheContext.cacheHasChanged) {
// 			await this._store(tokenCacheContext.tokenCache.serialize());
// 		}
// 	}

// 	dispose() {
// 		this._disposable.dispose();
// 	}

// 	private async _update(value: string) {
// 		const result = JSON.parse(value);
// 		const resolvedValue: string | undefined = Object.keys(result.Account).length === 0
// 			? undefined
// 			: value;

// 		if (value === this._value) {
// 			return;
// 		}

// 		this._value = value;
// 		await this._secretStorage.store(this._key, value);
// 	}

// 	private async _store(value: string) {
// 		if (value === this._value) {
// 			return;
// 		}

// 		const result = JSON.parse(value);
// 		// If there are no accounts in the cache, delete the cache
// 		if (Object.keys(result.Account).length === 0 && this._value) {
// 			await this._secretStorage.delete(this._key);
// 			return;
// 		}
// 		await this._secretStorage.store(this._key, value);
// 	}
// }
